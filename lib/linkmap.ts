// Internal Link Map crawler.
//
// Builds a snapshot of how a magazine website's pages link to each other:
//   1. seedCrawl()      — reads the Yoast sitemaps to learn every page/post URL
//                         and creates a SitePage row per URL (links wiped first)
//   2. crawlNextBatch() — fetches a batch of uncrawled pages, pulls the
//                         in-content links out of each, stores them as SiteLink
//                         rows; called repeatedly until nothing is left
//   3. finishCrawl()    — stamps the SiteCrawl row done
//
// Only editorial links count: on articles we read links inside the theme's
// `.tdb_single_content` body block; on other pages, links inside the main
// content area minus navigation/auto-generated modules. Menu and footer links
// are deliberately ignored — they connect every page to every other and would
// turn the map into a meaningless hairball.

import * as cheerio from "cheerio";
import { db } from "@/lib/db";

const USER_AGENT = "MEPCA-Hub-LinkMap/1.0 (internal SEO tool; jb@cimltd.co.uk)";
const FETCH_TIMEOUT_MS = 15_000;
const CONCURRENCY = 5;

// File extensions that are media/documents, not pages
const ASSET_RE = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|docx?|xlsx?|pptx?|mp4|mp3|css|js)$/i;

function hostOf(siteUrl: string): string {
  return new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
}

// Resolve an href against the page it appeared on and normalise it to a
// canonical form ("https://host/path", no www, no trailing slash, no query or
// fragment). Returns null for external links, assets and non-http schemes.
export function normalizeInternalUrl(
  href: string,
  baseUrl: string,
  siteHost: string
): string | null {
  let u: URL;
  try {
    u = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== siteHost) return null;
  const path = u.pathname.replace(/\/+$/, "");
  if (ASSET_RE.test(path)) return null;
  return `https://${host}${path}`;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Read the Yoast sitemap index and return every page/post/company-profile URL
// with its kind. Category, directory-category and template sitemaps are
// skipped on purpose.
export async function fetchSitemapEntries(
  siteUrl: string
): Promise<{ url: string; kind: "page" | "post" | "company" }[]> {
  const siteHost = hostOf(siteUrl);
  const index = await fetchText(`https://${siteHost}/sitemap_index.xml`);
  const locs = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  const wanted = locs.filter((l) => /\/(post|page|company)-sitemap\d*\.xml$/.test(l));

  const seen = new Map<string, "page" | "post" | "company">();
  for (const sitemapUrl of wanted) {
    const kind: "page" | "post" | "company" = /post-sitemap/.test(sitemapUrl)
      ? "post"
      : /company-sitemap/.test(sitemapUrl)
        ? "company"
        : "page";
    const xml = await fetchText(sitemapUrl);
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const norm = normalizeInternalUrl(m[1].trim(), siteUrl, siteHost);
      if (norm && !seen.has(norm)) seen.set(norm, kind);
    }
  }
  return [...seen.entries()].map(([url, kind]) => ({ url, kind }));
}

// Links inside these blocks are navigation chrome or auto-generated listings,
// not editorial choices, so they never count
const EXCLUDED_ANCESTORS = [
  ".td-header-template-wrap",
  ".td-footer-template-wrap",
  ".tdb_breadcrumbs",
  ".tdb_mobile_menu",
  ".tdb_header_menu",
  ".td_block_trending_now",
  ".td-g-rec", // ad spots
  "nav",
  "header",
  "footer",
].join(", ");

export function extractPage(
  html: string,
  pageUrl: string,
  siteHost: string,
  siteName: string
): { title: string | null; links: string[] } {
  const $ = cheerio.load(html);

  let title =
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text() ||
    null;
  if (title) {
    // drop the Yoast suffix: "Title | Site Name" (the SEO site name can differ
    // from the magazine name, e.g. MEPCA's is "UK Manufacturing Magazine")
    title = title.replace(/\s*\|[^|]*$/, "").trim();
    const esc = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(`\\s*[-–]\\s*${esc}.*$`, "i"), "").trim() || null;
  }

  // Articles: only the editorial body. Other pages: the whole main content
  // area (minus the excluded modules above).
  const single = $(".tdb_single_content");
  let scope = single.length ? single : $(".td-main-content-wrap");
  if (!scope.length) scope = $("main");
  if (!scope.length) scope = $("body");

  const links = new Set<string>();
  scope.find("a[href]").each((_, el) => {
    const $el = $(el);
    if ($el.closest(EXCLUDED_ANCESTORS).length) return;
    const href = $el.attr("href");
    if (!href) return;
    const norm = normalizeInternalUrl(href, pageUrl, siteHost);
    if (norm && norm !== pageUrl) links.add(norm);
  });

  return { title, links: [...links] };
}

// Phase 1: wipe the old snapshot and seed a SitePage per sitemap URL
export async function seedCrawl(magazineId: string, crawlId: string): Promise<number> {
  const magazine = await db.magazine.findUniqueOrThrow({ where: { id: magazineId } });
  const entries = await fetchSitemapEntries(magazine.siteUrl);
  if (entries.length === 0) throw new Error("Sitemap returned no pages");

  const siteHost = hostOf(magazine.siteUrl);
  await db.sitePage.deleteMany({ where: { magazineId } }); // cascades SiteLinks
  await db.sitePage.createMany({
    data: entries.map((e) => ({
      magazineId,
      url: e.url,
      path: e.url.replace(`https://${siteHost}`, "") || "/",
      kind: e.kind,
    })),
  });
  await db.siteCrawl.update({
    where: { id: crawlId },
    data: { status: "RUNNING", totalPages: entries.length, crawledPages: 0 },
  });
  return entries.length;
}

// Phase 2: crawl up to batchSize uncrawled pages. Returns how many are left.
export async function crawlNextBatch(
  magazineId: string,
  crawlId: string,
  batchSize: number
): Promise<{ crawled: number; remaining: number }> {
  const magazine = await db.magazine.findUniqueOrThrow({ where: { id: magazineId } });
  const siteHost = hostOf(magazine.siteUrl);

  const batch = await db.sitePage.findMany({
    where: { magazineId, crawledAt: null },
    take: batchSize,
    orderBy: { id: "asc" },
  });
  if (batch.length === 0) return { crawled: 0, remaining: 0 };

  // url -> id for the whole site, to resolve link targets to nodes
  const all = await db.sitePage.findMany({
    where: { magazineId },
    select: { id: true, url: true },
  });
  const idByUrl = new Map(all.map((p) => [p.url, p.id]));

  const linkRows: { magazineId: string; fromId: string; toId: string }[] = [];
  const pageUpdates: { id: string; title: string | null; httpStatus: number }[] = [];

  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    await Promise.all(
      batch.slice(i, i + CONCURRENCY).map(async (page) => {
        try {
          const res = await fetch(page.url, {
            headers: { "User-Agent": USER_AGENT },
            redirect: "follow",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          });
          const status = res.status;
          if (!res.ok) {
            pageUpdates.push({ id: page.id, title: null, httpStatus: status });
            return;
          }
          const html = await res.text();
          const { title, links } = extractPage(html, page.url, siteHost, magazine.name);
          pageUpdates.push({ id: page.id, title, httpStatus: status });
          for (const target of links) {
            const toId = idByUrl.get(target);
            if (toId && toId !== page.id) {
              linkRows.push({ magazineId, fromId: page.id, toId });
            }
          }
        } catch {
          pageUpdates.push({ id: page.id, title: null, httpStatus: 0 });
        }
      })
    );
  }

  if (linkRows.length > 0) {
    await db.siteLink.createMany({ data: linkRows, skipDuplicates: true });
  }
  const now = new Date();
  await db.$transaction(
    pageUpdates.map((u) =>
      db.sitePage.update({
        where: { id: u.id },
        data: { title: u.title, httpStatus: u.httpStatus, crawledAt: now },
      })
    )
  );
  await db.siteCrawl.update({
    where: { id: crawlId },
    data: { crawledPages: { increment: batch.length } },
  });

  const remaining = await db.sitePage.count({ where: { magazineId, crawledAt: null } });
  return { crawled: batch.length, remaining };
}

export async function finishCrawl(crawlId: string): Promise<void> {
  await db.siteCrawl.update({
    where: { id: crawlId },
    data: { status: "DONE", finishedAt: new Date() },
  });
}

// The node/link payload the 3D graph tab fetches
export async function getGraph(magazineId: string) {
  const pages = await db.sitePage.findMany({
    where: { magazineId, crawledAt: { not: null } },
    select: { id: true, url: true, path: true, title: true, kind: true, httpStatus: true },
  });
  const links = await db.siteLink.findMany({
    where: { magazineId },
    select: { fromId: true, toId: true },
  });
  return { pages, links };
}
