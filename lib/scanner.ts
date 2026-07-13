import { db } from "@/lib/db";
import type { WatchedSource } from "@prisma/client";
import { classifyWebsiteAds, scanPdfForAdvertisers, type FoundAdvertiser } from "@/lib/ai";

// Raw PDF must stay well under the API's 32MB request cap once base64-encoded (+33%)
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_CANDIDATES = 150;
const MAX_NEW_PDFS_PER_RUN = 2;

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
};

function absoluteUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// Pull linked images and ad iframes out of raw HTML — the candidates Claude classifies
export function extractAdCandidates(html: string, baseUrl: string) {
  const candidates: { href: string; imgSrc: string; alt: string }[] = [];

  const linkedImages = html.matchAll(
    /<a[^>]+href=["']([^"']+)["'][^>]*>\s*(?:<[^>]+>\s*)*<img[^>]+src=["']([^"']+)["'][^>]*?(?:alt=["']([^"']*)["'])?[^>]*>/gis
  );
  for (const m of linkedImages) {
    const href = absoluteUrl(m[1], baseUrl);
    const imgSrc = absoluteUrl(m[2], baseUrl);
    if (href && imgSrc) candidates.push({ href, imgSrc, alt: m[3] ?? "" });
  }

  const iframes = html.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi);
  for (const m of iframes) {
    const src = absoluteUrl(m[1], baseUrl);
    if (src) candidates.push({ href: src, imgSrc: src, alt: "(iframe embed)" });
  }

  // Drop obvious non-ads before they reach Claude (cheaper + less noise)
  const junk = /facebook|twitter|linkedin|instagram|youtube|\.svg|logo|icon|avatar|gravatar/i;
  return candidates
    .filter((c) => !junk.test(c.imgSrc))
    .slice(0, MAX_CANDIDATES);
}

function dedupeKeyFor(brand: string, magazine: string, adType: string | null) {
  return [brand, magazine, adType ?? ""].map((s) => s.toLowerCase().trim()).join("|");
}

async function upsertAdvertisers(
  found: FoundAdvertiser[],
  magazineName: string,
  sourceLabel: string
) {
  const now = new Date();
  let count = 0;
  for (const ad of found) {
    const brand = ad.brand?.trim();
    if (!brand) continue;
    const key = dedupeKeyFor(brand, magazineName, ad.adType || null);
    await db.competitorAdvertiser.upsert({
      where: { dedupeKey: key },
      create: {
        brand,
        competitorMagazine: magazineName,
        adType: ad.adType || null,
        whereFound: ad.whereFound || null,
        confidenceNotes: ad.confidence || null,
        source: sourceLabel,
        dedupeKey: key,
        lastImportedAt: now,
      },
      update: {
        whereFound: ad.whereFound || null,
        confidenceNotes: ad.confidence || null,
        lastImportedAt: now,
      },
    });
    count++;
  }
  return count;
}

export async function scanWebsiteSource(source: WatchedSource) {
  const res = await fetch(source.url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const candidates = extractAdCandidates(html, source.url);
  const found = await classifyWebsiteAds(source.name, source.url, candidates);
  const upserted = await upsertAdvertisers(found, source.name, new URL(source.url).hostname);

  const result = `Scanned ${candidates.length} placements, found ${upserted} advertisers`;
  await db.watchedSource.update({
    where: { id: source.id },
    data: { lastCheckedAt: new Date(), lastResult: result },
  });
  return result;
}

// Find links to issues/PDFs on an archive page that we haven't processed before
function findIssueLinks(html: string, baseUrl: string, type: "PDF_ARCHIVE" | "FLIPBOOK") {
  const links = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    const url = absoluteUrl(m[1], baseUrl);
    if (!url) continue;
    if (type === "PDF_ARCHIVE" && /\.pdf(\?|$)/i.test(url)) links.add(url);
    if (
      type === "FLIPBOOK" &&
      /yudu\.com|issuu\.com|joomag\.com|flippingbook|flickread|flipbook|\/issue|\/edition|\/magazine\//i.test(url)
    ) {
      links.add(url);
    }
  }
  return [...links];
}

export async function scanArchiveSource(source: WatchedSource) {
  const res = await fetch(source.url, { headers: FETCH_HEADERS });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const links = findIssueLinks(html, source.url, source.type as "PDF_ARCHIVE" | "FLIPBOOK");
  const seen = new Set(source.seenItems);
  const newLinks = links.filter((l) => !seen.has(l));

  // First ever check: record what's already published without alerting/scanning,
  // so we only ever react to issues that appear from now on
  if (!source.lastCheckedAt) {
    await db.watchedSource.update({
      where: { id: source.id },
      data: {
        lastCheckedAt: new Date(),
        lastResult: `Baseline recorded — ${links.length} existing issue(s), watching for new ones`,
        seenItems: links,
      },
    });
    return "Baseline recorded";
  }

  let result: string;

  if (source.type === "FLIPBOOK") {
    // Can't read flipbooks without a browser — alert JB to run the skill on them
    for (const link of newLinks) {
      await db.sourceAlert.create({
        data: {
          sourceId: source.id,
          message: `New issue of ${source.name} spotted — run the competitor-advertisers skill on it`,
          url: link,
        },
      });
    }
    result = newLinks.length
      ? `${newLinks.length} new issue link(s) found — alerts raised`
      : "No new issues";
  } else {
    let processed = 0;
    let alerted = 0;
    for (const pdfUrl of newLinks.slice(0, MAX_NEW_PDFS_PER_RUN)) {
      const pdfRes = await fetch(pdfUrl, { headers: FETCH_HEADERS });
      if (!pdfRes.ok) continue;
      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      if (buffer.byteLength > MAX_PDF_BYTES) {
        await db.sourceAlert.create({
          data: {
            sourceId: source.id,
            message: `New issue of ${source.name} is too large to scan automatically (${Math.round(buffer.byteLength / 1024 / 1024)}MB) — process it with the skill`,
            url: pdfUrl,
          },
        });
        alerted++;
        continue;
      }
      const found = await scanPdfForAdvertisers(source.name, buffer.toString("base64"));
      await upsertAdvertisers(found, source.name, pdfUrl);
      processed++;
    }
    result = newLinks.length
      ? `${newLinks.length} new PDF(s): ${processed} scanned, ${alerted} flagged for manual processing`
      : "No new issues";
  }

  await db.watchedSource.update({
    where: { id: source.id },
    data: {
      lastCheckedAt: new Date(),
      lastResult: result,
      seenItems: [...seen, ...newLinks],
    },
  });
  return result;
}

export async function scanSource(source: WatchedSource) {
  if (source.type === "WEBSITE") return scanWebsiteSource(source);
  return scanArchiveSource(source);
}
