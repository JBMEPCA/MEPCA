// Server-only WordPress REST client, one connection per magazine.
// Never import this into a client component — it holds the app-password auth.
//
// Notes learned by probing the live sites:
// - Auth is HTTP Basic (username + application password). Spaces in the
//   password are cosmetic and stripped before use.
// - MEPCA: "company" is a real taxonomy on posts, so we assign it like
//   categories (create the term if it doesn't exist, then pass company: [id]).
//   The old `newcompany` meta field the skill used is NOT registered and
//   silently drops. The other titles have no company taxonomy at all.
// - Yoast focus keyphrase / meta description / SEO title are written via post
//   `meta`, but only persist once the site exposes those keys over REST.
//   MEPCA needed the one-time Code Snippets registration; Hotel's Yoast (v28)
//   already exposes them natively.

import { getMagazine } from "@/lib/magazines";

// What we know about each connected site (probed live). A magazine without an
// entry here — or without credentials in the environment — shows the
// "not set up yet" screen instead of the Poster.
type WpSiteConfig = {
  // The vetted, publishable categories with their live term IDs. This is the
  // single source of truth for what the Poster is allowed to pick.
  categories: { name: string; id: number }[];
  defaultCategoryId: number;
  hasCompanyTaxonomy: boolean;
};

const SITE_CONFIG: Record<string, WpSiteConfig> = {
  // Probed from mepca-engineering.com; excludes every "NEVER USE" category JB flagged.
  mepca: {
    categories: [
      { name: "Additive Manufacturing", id: 98 },
      { name: "Adhesives", id: 174 },
      { name: "Business Operations", id: 169 },
      { name: "Cables & Connectors", id: 82 },
      { name: "Connectivity Focus", id: 146 },
      { name: "Control Solutions", id: 108 },
      { name: "Cooling Systems", id: 226 },
      { name: "Digital Transformation", id: 173 },
      { name: "Digitalisation", id: 287 },
      { name: "Drives, Motors & Controls", id: 83 },
      { name: "Electronics", id: 107 },
      { name: "Enclosures", id: 84 },
      { name: "Events", id: 91 },
      { name: "Facility Management", id: 222 },
      { name: "Food Processing", id: 137 },
      { name: "Health & Safety", id: 85 },
      { name: "HVAC", id: 127 },
      { name: "Hydraulics & Pneumatics", id: 105 },
      { name: "Imaging & Vision Solutions", id: 102 },
      { name: "Industrial Auctions", id: 177 },
      { name: "Industrial Data & AI", id: 180 },
      { name: "Machine Building", id: 115 },
      { name: "Machine Vision", id: 274 },
      { name: "Maintenance", id: 219 },
      { name: "Manufacturing News", id: 71 },
      { name: "Manufacturing Software", id: 92 },
      { name: "Materials Handling", id: 106 },
      { name: "Packaging & Inspection", id: 88 },
      { name: "Power & Energy", id: 87 },
      { name: "Process Control", id: 306 },
      { name: "Process Technology", id: 220 },
      { name: "Pumps & Pumping Systems", id: 89 },
      { name: "Robotics & Automation", id: 221 },
      { name: "Sensors & Sensing Systems", id: 101 },
      { name: "Sustainability", id: 124 },
      { name: "Test & Measurement", id: 104 },
      { name: "Tooling and Equipment", id: 273 },
      { name: "Warehouse & Logistics", id: 182 },
    ],
    defaultCategoryId: 71, // Manufacturing News — safe fallback.
    hasCompanyTaxonomy: true,
  },
  // Probed from thehotelmagazine.co.uk 2026-07-17 (excludes Uncategorized).
  hotel: {
    categories: [
      { name: "Industry News", id: 21 },
      { name: "International News", id: 31 },
      { name: "Interviews", id: 29 },
      { name: "Supplier News", id: 17 },
    ],
    defaultCategoryId: 17, // Supplier News — where press releases live.
    hasCompanyTaxonomy: false,
  },
};

type WpCreds = { site: string; username: string; appPassword: string };

// Resolve a magazine's WordPress credentials from the environment using its
// env suffix (e.g. WORDPRESS_APP_PASSWORD_HOTEL). MEPCA also falls back to the
// original unsuffixed vars so nothing already deployed breaks.
function credsFor(slug: string): WpCreds | null {
  const mag = getMagazine(slug);
  if (!mag) return null;
  const sfx = mag.envSuffix;
  let site = process.env[`WORDPRESS_SITE_URL_${sfx}`] ?? "";
  let username = process.env[`WORDPRESS_USERNAME_${sfx}`] ?? "";
  let appPassword = process.env[`WORDPRESS_APP_PASSWORD_${sfx}`] ?? "";
  if (slug === "mepca") {
    site ||= process.env.WORDPRESS_SITE_URL ?? "";
    username ||= process.env.WORDPRESS_USERNAME ?? "";
    appPassword ||= process.env.WORDPRESS_APP_PASSWORD ?? "";
  }
  site = (site || mag.siteUrl).replace(/\/$/, "");
  appPassword = appPassword.replace(/\s+/g, "");
  if (!username || !appPassword) return null;
  return { site, username, appPassword };
}

// Is this magazine fully connected (credentials + probed site config)?
export function hasWordPressCreds(slug: string): boolean {
  return credsFor(slug) !== null && slug in SITE_CONFIG;
}

export function hasCompanyTaxonomy(slug: string): boolean {
  return SITE_CONFIG[slug]?.hasCompanyTaxonomy ?? false;
}

export function categoriesFor(slug: string): { name: string; id: number }[] {
  return SITE_CONFIG[slug]?.categories ?? [];
}

function siteConfig(slug: string): WpSiteConfig {
  const cfg = SITE_CONFIG[slug];
  if (!cfg) throw new Error(`WordPress isn't set up for "${slug}" yet.`);
  return cfg;
}

function requireCreds(slug: string): WpCreds {
  const creds = credsFor(slug);
  if (!creds) {
    const mag = getMagazine(slug);
    const sfx = mag?.envSuffix ?? "…";
    throw new Error(
      `WordPress credentials for ${mag?.name ?? slug} are not set — add WORDPRESS_USERNAME_${sfx} and WORDPRESS_APP_PASSWORD_${sfx} in the environment.`
    );
  }
  return creds;
}

async function wpFetch(slug: string, path: string, init: RequestInit = {}): Promise<Response> {
  const { site, username, appPassword } = requireCreds(slug);
  const auth = "Basic " + Buffer.from(`${username}:${appPassword}`).toString("base64");
  const res = await fetch(`${site}/wp-json${path}`, {
    ...init,
    headers: {
      Authorization: auth,
      ...(init.headers ?? {}),
    },
    // Never cache writes or lookups — we always want live data.
    cache: "no-store",
  });
  return res;
}

async function wpJson<T>(slug: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await wpFetch(slug, path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WordPress ${init.method ?? "GET"} ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export function categoryIdForName(slug: string, name: string | null | undefined): number {
  const cfg = siteConfig(slug);
  if (!name) return cfg.defaultCategoryId;
  const wanted = name.trim().toLowerCase();
  const hit = cfg.categories.find((c) => c.name.toLowerCase() === wanted);
  return hit?.id ?? cfg.defaultCategoryId;
}

export type RelatedPost = { title: string; url: string };

// Search the magazine's published posts for internal-linking candidates.
export async function searchRelatedPosts(slug: string, query: string, perPage = 3): Promise<RelatedPost[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const results = await wpJson<{ title: string; url: string; subtype: string }[]>(
      slug,
      `/wp/v2/search?search=${encodeURIComponent(q)}&subtype=post&type=post&per_page=${perPage}`
    );
    return results
      .filter((r) => r.url && r.title)
      .map((r) => ({ title: decodeEntities(r.title), url: r.url }));
  } catch {
    // Internal linking is a nice-to-have; never let a search failure break drafting.
    return [];
  }
}

// Find an existing company taxonomy term by exact (case-insensitive) name, or
// create it. Returns the term id to assign on the post. Only valid on sites
// with the company taxonomy (MEPCA).
export async function findOrCreateCompany(slug: string, name: string): Promise<number | null> {
  if (!hasCompanyTaxonomy(slug)) return null;
  const clean = name.trim();
  if (!clean) return null;
  const existing = await wpJson<{ id: number; name: string }[]>(
    slug,
    `/wp/v2/company?search=${encodeURIComponent(clean)}&per_page=100`
  );
  const match = existing.find((t) => decodeEntities(t.name).toLowerCase() === clean.toLowerCase());
  if (match) return match.id;

  const created = await wpJson<{ id: number }>(slug, `/wp/v2/company`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: clean }),
  });
  return created.id;
}

export type DuplicateMatch = { id: number; title: string; link: string; status: string; score: number };

// Words ignored when comparing titles, so "New … for …" style filler doesn't
// inflate or deflate the similarity score.
const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "of", "to", "in", "on", "with", "new",
  "how", "why", "as", "at", "by", "from", "is", "are", "its", "&",
]);

function titleTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !TITLE_STOPWORDS.has(w))
  );
}

// How alike two titles are: blend of Jaccard overlap and containment (so a
// shorter title fully inside a longer one still scores high).
function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  const jaccard = inter / union;
  const containment = inter / Math.min(ta.size, tb.size);
  return Math.max(jaccard, containment);
}

// Check whether an article this similar has already been posted (published OR
// sitting as a draft). Returns strong title matches, most similar first. Never
// throws — a lookup failure just means "no known duplicate".
//
// WordPress' post search narrows as you add words, so searching the whole
// (slightly reworded) title tends to miss the real match. Instead we cast a
// few wide nets — company, focus keyphrase, and the most distinctive title
// words — gather candidates, then decide with title similarity.
export async function findPossibleDuplicates(
  slug: string,
  title: string,
  company?: string,
  keyphrase?: string
): Promise<DuplicateMatch[]> {
  const queries = new Set<string>();
  if (company && company.trim()) queries.add(company.trim());
  if (keyphrase && keyphrase.trim()) queries.add(keyphrase.trim());
  const keywords = [...titleTokens(title)].sort((a, b) => b.length - a.length).slice(0, 4);
  if (keywords.length) queries.add(keywords.join(" "));
  if (queries.size === 0) queries.add(title);

  const byId = new Map<number, { id: number; title: string; link: string; status: string }>();
  for (const q of queries) {
    try {
      const posts = await wpJson<
        { id: number; title: { rendered: string }; link: string; status: string }[]
      >(
        slug,
        `/wp/v2/posts?search=${encodeURIComponent(q)}&status=any&per_page=10&_fields=id,title,link,status`
      );
      for (const p of posts) byId.set(p.id, { id: p.id, title: p.title.rendered, link: p.link, status: p.status });
    } catch {
      /* ignore — treat as no match */
    }
  }

  const matches: DuplicateMatch[] = [];
  for (const p of byId.values()) {
    const clean = decodeEntities(p.title);
    const score = titleSimilarity(title, clean);
    if (score >= 0.5) {
      matches.push({ id: p.id, title: clean, link: p.link, status: p.status, score: Math.round(score * 100) / 100 });
    }
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

export type UploadedMedia = { id: number; sourceUrl: string };

// Upload one image to the Media Library. `data` is the raw bytes.
export async function uploadMedia(
  slug: string,
  data: ArrayBuffer,
  filename: string,
  mimeType: string,
  altText?: string
): Promise<UploadedMedia> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-") || "image.jpg";
  const media = await wpJson<{ id: number; source_url: string }>(slug, `/wp/v2/media`, {
    method: "POST",
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
    },
    body: Buffer.from(data),
  });
  if (altText) {
    // Best-effort alt text for SEO/accessibility; don't fail the upload over it.
    try {
      await wpJson(slug, `/wp/v2/media/${media.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: altText }),
      });
    } catch {
      /* ignore */
    }
  }
  return { id: media.id, sourceUrl: media.source_url };
}

export type CreateDraftInput = {
  title: string;
  content: string;
  excerpt: string;
  categoryId: number;
  companyId: number | null;
  featuredMediaId: number | null;
  focusKeyphrase: string;
  metaDescription: string;
  seoTitle?: string;
};

export type CreatedDraft = { id: number; link: string; editLink: string };

// Create the post as a DRAFT with everything filled in. Yoast fields go in
// `meta`; they take effect once the site exposes those keys over REST.
export async function createDraft(slug: string, input: CreateDraftInput): Promise<CreatedDraft> {
  const body: Record<string, unknown> = {
    title: input.title,
    content: input.content,
    excerpt: input.excerpt,
    status: "draft",
    categories: [input.categoryId],
    meta: {
      _yoast_wpseo_focuskw: input.focusKeyphrase,
      _yoast_wpseo_metadesc: input.metaDescription,
      ...(input.seoTitle ? { _yoast_wpseo_title: input.seoTitle } : {}),
    },
  };
  if (input.companyId && hasCompanyTaxonomy(slug)) body.company = [input.companyId];
  if (input.featuredMediaId) body.featured_media = input.featuredMediaId;

  const post = await wpJson<{ id: number; link: string }>(slug, `/wp/v2/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    id: post.id,
    link: post.link,
    editLink: `${requireCreds(slug).site}/wp-admin/post.php?post=${post.id}&action=edit`,
  };
}

// WordPress returns titles with HTML entities (&amp;, &#8217; …). Decode the
// common ones so matching and display are clean.
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&#8217;/g, "’")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}
