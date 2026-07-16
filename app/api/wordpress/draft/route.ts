import { structureArticle, insertInternalLinks } from "@/lib/wordpress-article";
import { CATEGORIES, searchRelatedPosts, type RelatedPost } from "@/lib/wordpress";

// Text is extracted in the browser and posted as JSON, so the payload stays
// small. This route does the Claude structuring + live internal-link search and
// returns a proposal for JB to review. Nothing is written to WordPress here.
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: { text?: string; bodyImageCount?: number; brandUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  const bodyImageCount = Math.max(0, Math.min(10, Number(body.bodyImageCount) || 0));
  const brandUrl = (body.brandUrl ?? "").trim();

  if (text.length < 200) {
    return Response.json(
      { error: "Couldn't read enough text. Paste the article or drop a text-based PDF/Word file." },
      { status: 400 }
    );
  }

  try {
    const article = await structureArticle(text, bodyImageCount, brandUrl || undefined);

    // Search MEPCA's own site for related articles, then let Claude weave in links.
    const seen = new Set<string>();
    const candidates: RelatedPost[] = [];
    for (const q of article.internalLinkQueries) {
      const hits = await searchRelatedPosts(q, 3);
      for (const h of hits) {
        if (!seen.has(h.url)) {
          seen.add(h.url);
          candidates.push(h);
        }
      }
    }
    const bodyHtml = await insertInternalLinks(article.bodyHtml, candidates.slice(0, 6));

    return Response.json({
      title: article.title,
      category: article.category,
      categoryOptions: CATEGORIES.map((c) => c.name),
      company: article.company,
      focusKeyphrase: article.focusKeyphrase,
      metaDescription: article.metaDescription,
      excerpt: article.excerpt,
      sourceUrl: article.sourceUrl ?? "",
      bodyHtml,
      internalLinksFound: candidates.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong drafting the article.";
    return Response.json({ error: message }, { status: 500 });
  }
}
