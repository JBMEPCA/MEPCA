// Serper.dev Google Search API client.
// The Sniper agent runs each monitored term as a UK-targeted Google search and
// reads back the paid "Ad" block — i.e. the companies actively spending money on
// Google Ads for that term. Those are the prospective advertisers we log.
//
// Serper returns an `ads` array alongside organic results. Field names aren't
// tightly documented and can drift, so the parser below is deliberately
// tolerant: it accepts several likely key spellings and never throws on a shape
// it doesn't recognise (it just yields fewer/no leads and lets the caller report
// that honestly).

const ENDPOINT = "https://google.serper.dev/search";

export type SerperAd = {
  company: string; // best-guess advertiser/brand name
  website: string | null; // destination or displayed domain
  headline: string | null; // ad headline/title
  description: string | null; // ad body copy
};

function key(): string {
  const k = process.env.SERPER_API_KEY;
  if (!k) {
    throw new Error("SERPER_API_KEY is not set — add it in Vercel env settings");
  }
  return k;
}

// Pull the first present, non-empty string from a list of candidate keys
function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Turn a bare domain into a tidy brand guess ("sage.com" -> "Sage") as a last
// resort when the ad has no explicit advertiser name.
function brandFromHost(host: string | null): string | null {
  if (!host) return null;
  const core = host.split(".")[0];
  if (!core) return null;
  return core.charAt(0).toUpperCase() + core.slice(1);
}

function parseAd(raw: Record<string, unknown>): SerperAd | null {
  const headline = firstString(raw, ["title", "headline", "adTitle"]);
  const link = firstString(raw, ["link", "url", "destinationUrl"]);
  const displayed = firstString(raw, [
    "displayedLink",
    "displayed_link",
    "displayLink",
    "displayUrl",
    "domain",
  ]);
  const description = firstString(raw, ["snippet", "description", "body", "text"]);
  const source = firstString(raw, ["source", "advertiser", "company", "seller"]);

  const host = hostnameOf(displayed) ?? hostnameOf(link);
  const website = displayed ?? host ?? null;
  const company = source ?? brandFromHost(host) ?? headline;

  if (!company) return null;
  return { company, website, headline, description };
}

// Serper nests ads under a few possible keys across versions/plans.
function extractAdArray(data: Record<string, unknown>): Record<string, unknown>[] {
  const candidates = [data["ads"], data["paidResults"], data["shopping"]];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Record<string, unknown>[];
  }
  return [];
}

// Run one UK-targeted search and return the advertisers in the paid ad block.
export async function searchGoogleAds(term: string): Promise<SerperAd[]> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-KEY": key(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: term,
      gl: "gb", // country: United Kingdom
      location: "United Kingdom",
      hl: "en",
      num: 10,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Serper HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const rawAds = extractAdArray(data);

  const seen = new Set<string>();
  const ads: SerperAd[] = [];
  for (const raw of rawAds) {
    const ad = parseAd(raw);
    if (!ad) continue;
    const dedupe = ad.company.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    ads.push(ad);
  }
  return ads;
}
