import Anthropic from "@anthropic-ai/sdk";
import { categoriesFor } from "@/lib/wordpress";
import { getMagazine } from "@/lib/magazines";
import { editorialStyle } from "@/lib/editorial-style";

// Turns a raw press release / article into a structured, WordPress-ready
// proposal that JB reviews before a draft is created. All the SEO/formatting
// decisions live here so the API route stays thin. Everything is written per
// magazine — the title's name, sector and category list feed the prompt.

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it in the environment.");
  }
  _client ??= new Anthropic();
  return _client;
}

const MODEL = "claude-opus-4-8";

export type StructuredArticle = {
  title: string;
  category: string;
  company: string;
  focusKeyphrase: string;
  metaDescription: string;
  excerpt: string;
  sourceUrl: string | null;
  bodyHtml: string;
  internalLinkQueries: string[];
};

const STRUCTURE_INSTRUCTIONS = `You are {{MAG_NAME}}'s web editor. {{MAG_NAME}} is a {{MAG_SECTOR}}. Turn the supplied article/press-release text into a clean, WordPress-ready blog post and its SEO metadata.

Return ONLY a JSON object (no markdown fence, no commentary) with these exact keys:
{
  "title": string,              // {{TITLE_RULE}}
  "category": string,           // EXACTLY one of the allowed categories below
  "company": string,            // the single primary company the article is about, full brand name as written
  "focusKeyphrase": string,     // 2-4 words someone would Google to find this; include the product/company where it helps ranking
  "metaDescription": string,    // UNDER 155 characters, naturally includes the focus keyphrase, plain prose
  "excerpt": string,            // 1-2 sentence summary, plain prose, no dashes as separators
  "sourceUrl": string | null,   // the brand's own URL found in the text (their website or the release's source link); null if none is present
  "bodyHtml": string,           // the article body as HTML (see rules)
  "internalLinkQueries": string[] // 3-5 short topic phrases to search {{MAG_NAME}}'s own site for related articles to link to
}

Allowed categories (pick the single best fit — never invent one): {{CATEGORY_NAMES}}

bodyHtml rules (house style — follow exactly):
- Do NOT include the title (no heading tag for it).
- Begin with a STANDFIRST: one short, engaging sentence summarising the article, wrapped in <h4>. Then start the opening paragraph.
- Use <h4> for ALL section subheadings — never <h2> or <h3>. Use <p> for paragraphs and <ul>/<li> for bullet lists.
- NEVER use bold. Do not use <strong> or <b> tags (or any bold styling) anywhere. Emphasise through wording, not formatting.
- UK spelling (optimised, programmes, organisation, centre). Warm, professional, factual voice. No hype words ("groundbreaking", "revolutionary", "game-changing"). Do not invent facts.
- Strip any tracking URLs, email artefacts, "for more information contact…" boilerplate, and image credits.
- Link to the brand at least once: wrap the first mention of the primary company in <a href="[[SOURCE_URL]]" target="_blank" rel="noopener">Company Name</a>. Use the literal placeholder [[SOURCE_URL]] as the href — it is filled in later. If and only if there is genuinely no company to link, omit the anchor.
- IMAGE PLACEHOLDERS: there are exactly {{IMAGE_COUNT}} in-article images to place in the body (this is separate from the feature image, which is handled elsewhere). Insert the literal markers [[IMAGE_1]], [[IMAGE_2]], … each on its own line at sensible points between paragraphs (never before the first paragraph, never two in a row). If {{IMAGE_COUNT}} is 0, insert no image markers.{{EXTRA_RULES}}
- Do not add internal links yourself here — that happens in a later step using internalLinkQueries.`;

const DEFAULT_TITLE_RULE =
  "the article headline in Title Case (capitalise the main words; keep minor words like a/an/the/of/for/and/to lower-case unless first or last). Preserve deliberate brand/product capitalisation exactly (igus, xiros, iPhone, MEPCA). No site name.";
const UPPER_TITLE_RULE =
  "the article headline in ALL CAPITALS — uppercase every letter of every word (e.g. \"NEW SPA OPENS AT THE GRAND HOTEL\"). No site name.";

// Build the magazine-specific extra bodyHtml rules (About Us removal, hyperlink
// preservation, pull quotes) from the editorial style config.
function extraRules(slug: string): string {
  const style = editorialStyle(slug);
  const rules: string[] = [];
  if (style.removeAboutSection) {
    rules.push(
      'Remove any "About Us", "About <company>", or company boilerplate/biography section (usually at the very end) entirely — do not include it or a heading for it.'
    );
  }
  if (style.preserveHyperlinks) {
    rules.push(
      'The supplied article text may be HTML containing <a href="…"> hyperlinks. Keep every such hyperlink on the same anchor text in your output, with the href exactly as given. Do not invent links. If the primary company already has such a hyperlink in the source, keep that original link rather than replacing it with the [[SOURCE_URL]] placeholder.'
    );
  }
  if (style.pullQuotes !== "none") {
    const limit =
      style.pullQuotes === "max-two"
        ? "Use a MAXIMUM of one or two pull quotes in the whole article."
        : "Use pull quotes throughout the article wherever they add impact.";
    rules.push(
      `${limit} A pull quote is a short, striking sentence or spokesperson quote that ALREADY appears in the article — never invent one. Render each as <figure class="wp-block-pullquote"><blockquote><p>QUOTE</p></blockquote></figure> on its own line between paragraphs.`
    );
  }
  return rules.length ? "\n" + rules.map((r) => `- ${r}`).join("\n") : "";
}

function stripToJson(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first > 0 || last < t.length - 1) t = t.slice(first, last + 1);
  return t;
}

export async function structureArticle(
  magazineSlug: string,
  sourceText: string,
  bodyImageCount: number,
  brandUrlHint?: string
): Promise<StructuredArticle> {
  const mag = getMagazine(magazineSlug);
  if (!mag) throw new Error(`Unknown magazine "${magazineSlug}".`);
  const categoryNames = categoriesFor(magazineSlug)
    .map((c) => c.name)
    .join(", ");

  const style = editorialStyle(magazineSlug);
  const text = sourceText.slice(0, 120_000);
  const system = STRUCTURE_INSTRUCTIONS.replaceAll("{{MAG_NAME}}", mag.name)
    .replaceAll("{{MAG_SECTOR}}", mag.sector)
    .replaceAll("{{CATEGORY_NAMES}}", categoryNames)
    .replaceAll("{{IMAGE_COUNT}}", String(bodyImageCount))
    .replaceAll("{{TITLE_RULE}}", style.titleStyle === "upper" ? UPPER_TITLE_RULE : DEFAULT_TITLE_RULE)
    .replaceAll("{{EXTRA_RULES}}", extraRules(magazineSlug));

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [
      {
        role: "user",
        content:
          (brandUrlHint
            ? `The user says the brand's website is: ${brandUrlHint} — use this as sourceUrl if the text has none.\n\n`
            : "") +
          `Here is the article text. Produce the JSON.\n\n---\n\n${text}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this article. Try different text.");
  }
  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = block?.text?.trim();
  if (!raw) throw new Error("No article was generated — try again.");

  let parsed: StructuredArticle;
  try {
    parsed = JSON.parse(stripToJson(raw)) as StructuredArticle;
  } catch {
    throw new Error("The generated article couldn't be read. Please try again.");
  }

  // Prefer the user-supplied brand URL when they gave one.
  if (brandUrlHint && brandUrlHint.trim()) parsed.sourceUrl = brandUrlHint.trim();
  parsed.internalLinkQueries = Array.isArray(parsed.internalLinkQueries)
    ? parsed.internalLinkQueries.slice(0, 5)
    : [];
  parsed.metaDescription = (parsed.metaDescription ?? "").slice(0, 160);
  return parsed;
}

// Second pass: given the body and a shortlist of the magazine's real articles,
// weave in up to 3 internal links. Kept separate so a search failure can't
// break drafting.
export async function insertInternalLinks(
  magazineSlug: string,
  bodyHtml: string,
  candidates: { title: string; url: string }[]
): Promise<string> {
  if (candidates.length === 0) return bodyHtml;
  const magName = getMagazine(magazineSlug)?.name ?? "the magazine";

  const list = candidates.map((c, i) => `${i + 1}. "${c.title}" — ${c.url}`).join("\n");
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: `You add internal links to an existing HTML article body for SEO. You are given a list of real ${magName} articles. Insert AT MOST 3 of them as <a href="URL">anchor text</a> where the surrounding sentence is genuinely relevant — anchor text must be natural words already in (or fitting) the sentence, not "click here". Never link the same URL twice. Do not otherwise change the wording, structure, existing links, or the [[IMAGE_n]] / [[SOURCE_URL]] placeholders. If none of the articles are relevant, return the body unchanged. Return ONLY the HTML body, no commentary or code fence.`,
    messages: [
      {
        role: "user",
        content: `Candidate ${magName} articles:\n${list}\n\n---\n\nHTML body:\n${bodyHtml}`,
      },
    ],
  });

  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  let out = block?.text?.trim();
  if (!out) return bodyHtml;
  if (out.startsWith("```")) {
    out = out.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  // Safety: if the model dropped our placeholders, fall back to the original.
  const okImages = (bodyHtml.match(/\[\[IMAGE_/g) ?? []).length === (out.match(/\[\[IMAGE_/g) ?? []).length;
  const okSource = bodyHtml.includes("[[SOURCE_URL]]") === out.includes("[[SOURCE_URL]]");
  return okImages && okSource ? out : bodyHtml;
}
