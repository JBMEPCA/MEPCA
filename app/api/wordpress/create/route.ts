import {
  createDraft,
  findOrCreateCompany,
  categoryIdForName,
} from "@/lib/wordpress";

// Assembles the final HTML (dropping in the already-uploaded images + brand
// source link), creates/looks up the company term, and creates the DRAFT post.
export const maxDuration = 60;

type BodyImage = { sourceUrl: string; alt?: string; caption?: string };

type CreateBody = {
  title?: string;
  bodyHtml?: string;
  excerpt?: string;
  category?: string;
  company?: string;
  focusKeyphrase?: string;
  metaDescription?: string;
  sourceUrl?: string;
  featuredMediaId?: number | null;
  bodyImages?: BodyImage[];
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function figure(img: BodyImage): string {
  const alt = escapeAttr(img.alt ?? "");
  const cap = img.caption ? `<figcaption>${escapeHtml(img.caption)}</figcaption>` : "";
  return `<figure class="wp-block-image size-large"><img src="${escapeAttr(img.sourceUrl)}" alt="${alt}"/>${cap}</figure>`;
}

// Replace [[SOURCE_URL]] anchor and [[IMAGE_n]] markers with real content.
function assembleBody(bodyHtml: string, sourceUrl: string, bodyImages: BodyImage[]): string {
  let html = bodyHtml;

  // Brand source link.
  if (sourceUrl) {
    html = html.replaceAll("[[SOURCE_URL]]", escapeAttr(sourceUrl));
  } else {
    // No link available — unwrap the anchor so the brand name stays as plain text.
    html = html.replace(/<a href="\[\[SOURCE_URL\]\]"[^>]*>(.*?)<\/a>/gis, "$1");
    html = html.replaceAll("[[SOURCE_URL]]", "#");
  }

  // In-article images, in order.
  bodyImages.forEach((img, i) => {
    html = html.replaceAll(`[[IMAGE_${i + 1}]]`, figure(img));
  });
  // Any leftover markers with no matching image → remove.
  html = html.replace(/\[\[IMAGE_\d+\]\]/g, "");
  // Any images beyond the markers → append at the end.
  if (bodyImages.length) {
    const usedMarkers = (bodyHtml.match(/\[\[IMAGE_\d+\]\]/g) ?? []).length;
    for (let i = usedMarkers; i < bodyImages.length; i++) {
      html += `\n${figure(bodyImages[i])}`;
    }
  }
  return html.trim();
}

export async function POST(request: Request) {
  let body: CreateBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const rawBody = (body.bodyHtml ?? "").trim();
  if (!title || !rawBody) {
    return Response.json({ error: "Title and body are required." }, { status: 400 });
  }

  const bodyImages = Array.isArray(body.bodyImages) ? body.bodyImages : [];
  const sourceUrl = (body.sourceUrl ?? "").trim();
  const content = assembleBody(rawBody, sourceUrl, bodyImages);

  try {
    const companyName = (body.company ?? "").trim();
    const companyId = companyName ? await findOrCreateCompany(companyName) : null;

    const draft = await createDraft({
      title,
      content,
      excerpt: (body.excerpt ?? "").trim(),
      categoryId: categoryIdForName(body.category),
      companyId,
      featuredMediaId: body.featuredMediaId ?? null,
      focusKeyphrase: (body.focusKeyphrase ?? "").trim(),
      metaDescription: (body.metaDescription ?? "").trim().slice(0, 160),
      seoTitle: title,
    });

    return Response.json({ link: draft.link, editLink: draft.editLink, id: draft.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong creating the draft.";
    return Response.json({ error: message }, { status: 500 });
  }
}
