// Server-only WordPress REST client for the MEPCA site.
// Never import this into a client component — it holds the app-password auth.
//
// Notes learned by probing the live site (mepca-engineering.com):
// - Auth is HTTP Basic (JamesB + application password). Spaces in the password
//   are cosmetic and stripped before use.
// - "company" is a real taxonomy on posts, so we assign it like categories
//   (create the term if it doesn't exist, then pass company: [id]). The old
//   `newcompany` meta field the skill used is NOT registered and silently drops.
// - Yoast focus keyphrase / meta description / SEO title are written via post
//   `meta`, but only work once the site registers those keys for REST (the
//   one-time Code Snippets step). Until then WordPress silently ignores them.

const SITE = (process.env.WORDPRESS_SITE_URL ?? "https://mepca-engineering.com").replace(/\/$/, "");
const USERNAME = process.env.WORDPRESS_USERNAME ?? "";
const APP_PASSWORD = (process.env.WORDPRESS_APP_PASSWORD ?? "").replace(/\s+/g, "");

function authHeader(): string {
  if (!USERNAME || !APP_PASSWORD) {
    throw new Error(
      "WordPress credentials are not set — add WORDPRESS_USERNAME and WORDPRESS_APP_PASSWORD in the environment."
    );
  }
  return "Basic " + Buffer.from(`${USERNAME}:${APP_PASSWORD}`).toString("base64");
}

async function wpFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${SITE}/wp-json${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      ...(init.headers ?? {}),
    },
    // Never cache writes or lookups — we always want live data.
    cache: "no-store",
  });
  return res;
}

async function wpJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await wpFetch(path, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WordPress ${init.method ?? "GET"} ${path} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

// The vetted, publishable categories with their live term IDs (probed from the
// site; excludes every "NEVER USE" category JB flagged). This is the single
// source of truth for what the Poster is allowed to pick.
export const CATEGORIES: { name: string; id: number }[] = [
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
];

const DEFAULT_CATEGORY_ID = 71; // Manufacturing News — safe fallback.

export function categoryIdForName(name: string | null | undefined): number {
  if (!name) return DEFAULT_CATEGORY_ID;
  const wanted = name.trim().toLowerCase();
  const hit = CATEGORIES.find((c) => c.name.toLowerCase() === wanted);
  return hit?.id ?? DEFAULT_CATEGORY_ID;
}

export type RelatedPost = { title: string; url: string };

// Search published posts on the live site for internal-linking candidates.
export async function searchRelatedPosts(query: string, perPage = 3): Promise<RelatedPost[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const results = await wpJson<{ title: string; url: string; subtype: string }[]>(
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
// create it. Returns the term id to assign on the post.
export async function findOrCreateCompany(name: string): Promise<number | null> {
  const clean = name.trim();
  if (!clean) return null;
  const existing = await wpJson<{ id: number; name: string }[]>(
    `/wp/v2/company?search=${encodeURIComponent(clean)}&per_page=100`
  );
  const match = existing.find((t) => decodeEntities(t.name).toLowerCase() === clean.toLowerCase());
  if (match) return match.id;

  const created = await wpJson<{ id: number }>(`/wp/v2/company`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: clean }),
  });
  return created.id;
}

export type UploadedMedia = { id: number; sourceUrl: string };

// Upload one image to the Media Library. `data` is the raw bytes.
export async function uploadMedia(
  data: ArrayBuffer,
  filename: string,
  mimeType: string,
  altText?: string
): Promise<UploadedMedia> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "-") || "image.jpg";
  const media = await wpJson<{ id: number; source_url: string }>(`/wp/v2/media`, {
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
      await wpJson(`/wp/v2/media/${media.id}`, {
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
// `meta`; they take effect once the site's REST-meta registration is in place.
export async function createDraft(input: CreateDraftInput): Promise<CreatedDraft> {
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
  if (input.companyId) body.company = [input.companyId];
  if (input.featuredMediaId) body.featured_media = input.featuredMediaId;

  const post = await wpJson<{ id: number; link: string }>(`/wp/v2/posts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    id: post.id,
    link: post.link,
    editLink: `${SITE}/wp-admin/post.php?post=${post.id}&action=edit`,
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
