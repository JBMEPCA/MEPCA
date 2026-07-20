import Anthropic from "@anthropic-ai/sdk";

// Claude's two jobs for the E-shot Builder:
// 1. structureEshot — turn client-supplied copy (Word doc / PDF / pasted text,
//    possibly with links preserved as HTML) into the e-shot body plus the
//    campaign metadata JB reviews (subject, preview text, sender name).
// 2. extractEshotMeta — for ready-made client HTML, only suggest the metadata;
//    the HTML itself is never touched.
//
// Solus copy is client-approved, so unlike the WordPress Poster the wording is
// preserved — Claude formats and extracts, it does not rewrite.

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set — add it in the environment.");
  }
  _client ??= new Anthropic();
  return _client;
}

const MODEL = "claude-opus-4-8";

export type EshotDraft = {
  subject: string;
  previewText: string;
  senderName: string;
  bodyHtml: string;
  ctaUrl: string;
};

export type EshotMeta = {
  subject: string;
  previewText: string;
  senderName: string;
};

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

async function askForJson<T>(system: string, user: string): Promise<T> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("The model declined to process this content. Try different text.");
  }
  const block = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const raw = block?.text?.trim();
  if (!raw) throw new Error("Nothing was generated — please try again.");
  try {
    return JSON.parse(stripToJson(raw)) as T;
  } catch {
    throw new Error("The generated draft couldn't be read. Please try again.");
  }
}

const STRUCTURE_INSTRUCTIONS = `You prepare solus promotional e-shots (single-advertiser email blasts) that a trade-magazine publisher sends to its subscriber audience on behalf of an advertiser client. You are given the client's approved copy (sometimes as HTML with links and bold preserved, sometimes plain text).

Return ONLY a JSON object (no markdown fence, no commentary) with these exact keys:
{
  "subject": string,      // the email subject line. If the copy contains an explicit subject (e.g. a line starting "Subject", "Subject Header", "Subject line"), use that text EXACTLY (minus the label). Otherwise write a concise, compelling subject from the copy. Never invent claims.
  "previewText": string,  // inbox preheader, UNDER 140 characters, complements the subject rather than repeating it, drawn from the copy
  "senderName": string,   // the advertiser company the e-shot is for, exactly as branded in the copy (e.g. "Verder Liquids") — this becomes the email's From name
  "ctaUrl": string,       // the main destination URL: the CTA link from the copy, else the brand URL provided in the request, else the advertiser's homepage if it appears in the copy, else ""
  "bodyHtml": string      // the e-shot body as an HTML fragment (see rules)
}

bodyHtml rules — follow exactly:
- PRESERVE THE CLIENT'S WORDING. This is approved advertiser copy: keep every sentence as written. Only remove non-copy artefacts: the subject-line label, file boilerplate, "[image]" notes and similar.
- Use <p> for paragraphs, <h2> for the section headings the copy already has (often bold lines), <ul>/<li> for bullet lists, <strong> where the copy is emphasised.
- KEEP every hyperlink from the copy: <a href="URL" target="_blank">anchor text</a>. Never drop or shorten a tracking URL — reproduce it character-for-character.
- The main call-to-action link (e.g. "Contact us", "Learn more", "Find out more") gets class="cta-button" on its <a> tag and sits in its OWN <p> containing nothing else — no emoji, arrows or surrounding words. The sentence the CTA came from is REPLACED by the button: don't also keep it as text (exception to the preserve-wording rule; fold any essential remaining words into the previous paragraph). Keep the button label SHORT — 2 to 5 words (e.g. "Contact us", "Get a quote", "Learn more"). If the copy has no linked CTA but a brand URL is provided in the request, add one closing CTA button using that URL with a short label that fits the copy.
- IMAGE MARKERS: there are exactly {{IMAGE_COUNT}} images supplied. Insert the literal markers [[IMAGE_1]], [[IMAGE_2]], … each on its own line. [[IMAGE_1]] goes at the VERY TOP as the hero banner, before any text. Spread the rest at sensible breaks between sections (never two in a row). If {{IMAGE_COUNT}} is 0, insert no markers.
- Do not add copyright lines, unsubscribe text or a footer — the template adds those.`;

export async function structureEshot(
  sourceContent: string,
  imageCount: number,
  brandUrlHint?: string
): Promise<EshotDraft> {
  const system = STRUCTURE_INSTRUCTIONS.replaceAll("{{IMAGE_COUNT}}", String(imageCount));
  const draft = await askForJson<EshotDraft>(
    system,
    (brandUrlHint ? `The advertiser's website / CTA target: ${brandUrlHint}\n\n` : "") +
      `Here is the client's e-shot copy. Produce the JSON.\n\n---\n\n${sourceContent.slice(0, 120_000)}`
  );
  draft.previewText = (draft.previewText ?? "").slice(0, 150);
  return draft;
}

// One round of the review-stage amend chat: apply an instruction like "make
// the button orange" or "change the link to …" to the current proof. Works on
// the styled body (files mode) or the full client HTML (html mode), and may
// also adjust the campaign fields when the instruction asks for it.
export type EshotAmendment = {
  html: string;
  subject: string;
  previewText: string;
  senderName: string;
  linkUrl: string;
  note: string;
};

export async function amendEshot(input: {
  html: string;
  subject: string;
  previewText: string;
  senderName: string;
  linkUrl: string;
  instruction: string;
}): Promise<EshotAmendment> {
  const amended = await askForJson<EshotAmendment>(
    `You are amending the proof of a solus promotional e-shot for a trade-magazine publisher. You get the current email HTML, the campaign fields, and one instruction from the user. Apply EXACTLY what the instruction asks — nothing more. These are usually small client amends: wording tweaks, sizes, colours, links, subject changes.

Return ONLY a JSON object (no fence, no commentary) with exactly these keys:
{
  "html": string,        // the amended HTML. If the instruction doesn't touch the layout/content, return it UNCHANGED character-for-character.
  "subject": string,     // the (possibly amended) subject line
  "previewText": string, // the (possibly amended) preview text, under 140 characters
  "senderName": string,  // the (possibly amended) From name
  "linkUrl": string,     // the (possibly amended) URL that images link to
  "note": string         // one short sentence saying what you changed, e.g. "Made the button orange." — or what you couldn't do and why
}

HTML rules:
- Styles are INLINE (email HTML) — amend sizes/colours by editing the style attributes, keeping the rest of each style intact.
- NEVER remove or alter [[IMAGE_n]] markers or *|…|* merge tags unless explicitly told to.
- Keep all URLs character-for-character unless the instruction changes them.
- Do not reformat, re-indent or "clean up" anything you weren't asked to touch.`,
    `Current campaign fields:
subject: ${input.subject}
previewText: ${input.previewText}
senderName: ${input.senderName}
linkUrl (images/CTA): ${input.linkUrl}

Instruction: ${input.instruction}

---

Current HTML:
${input.html.slice(0, 150_000)}`
  );
  amended.previewText = (amended.previewText ?? "").slice(0, 150);
  return amended;
}

export async function extractEshotMeta(html: string): Promise<EshotMeta> {
  const meta = await askForJson<EshotMeta>(
    `You are given a finished promotional solus e-shot as HTML, sent by a trade-magazine publisher on behalf of an advertiser client. Suggest its campaign metadata. Return ONLY a JSON object (no fence, no commentary) with exactly these keys:
{
  "subject": string,      // a subject line for this email — use the <title> if it is a real subject, otherwise write one from the visible content. Never invent claims.
  "previewText": string,  // inbox preheader, UNDER 140 characters, drawn from the content
  "senderName": string    // the advertiser company the e-shot promotes, exactly as branded — this becomes the From name
}`,
    `Here is the e-shot HTML.\n\n---\n\n${html.slice(0, 120_000)}`
  );
  meta.previewText = (meta.previewText ?? "").slice(0, 150);
  return meta;
}
