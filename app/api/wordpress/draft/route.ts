import { structureArticle, insertInternalLinks } from "@/lib/wordpress-article";
import {
  categoriesFor,
  hasWordPressCreds,
  hasCompanyTaxonomy,
  searchRelatedPosts,
  findPossibleDuplicates,
  type RelatedPost,
} from "@/lib/wordpress";

// Text is extracted in the browser and posted as JSON, so the payload stays
// small. This route does the Claude structuring + live internal-link search and
// returns a proposal for JB to review. Nothing is written to WordPress here.
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: { magazine?: string; text?: string; bodyImageCount?: number; brandUrl?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const magazine = (body.magazine ?? "mepca").trim();
  if (!hasWordPressCreds(magazine)) {
    return Response.json({ error: "WordPress isn't connected for this magazine yet." }, { status: 400 });
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
    const article = await structureArticle(magazine, text, bodyImageCount, brandUrl || undefined);

    // Search the magazine's own site for related articles, then let Claude weave in links.
    const seen = new Set<string>();
    const candidates: RelatedPost[] = [];
    for (const q of article.internalLinkQueries) {
      const hits = await searchRelatedPosts(magazine, q, 3);
      for (const h of hits) {
        if (!seen.has(h.url)) {
          seen.add(h.url);
          candidates.push(h);
        }
      }
    }
    const bodyHtml = await insertInternalLinks(magazine, article.bodyHtml, candidates.slice(0, 6));

    // Failsafe: has a very similar article already been posted (or drafted)?
    const duplicates = await findPossibleDuplicates(
      magazine,
      article.title,
      article.company,
      article.focusKeyphrase
    );

    return Response.json({
      title: article.title,
      duplicates,
      category: article.category,
      categoryOptions: categoriesFor(magazine).map((c) => c.name),
      hasCompanyTaxonomy: hasCompanyTaxonomy(magazine),
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
