// Verifies the whole E-shot Builder pipeline against the live Mailchimp and
// Anthropic APIs using the same lib functions the API routes call:
// docx copy → Claude structuring → house template → File Manager image upload
// → draft campaign with a tag exclusion → test email to digital@cimltd.co.uk.
//
// Usage: node --env-file=.env scripts/test-eshot.mjs <copy.docx> [image1] [image2…]
// Creates a REAL draft campaign (clearly named) — delete it in Mailchimp after.
import { readFile } from "node:fs/promises";
import mammoth from "mammoth";
import {
  listAudiences,
  listSegments,
  uploadImage,
  createDraftCampaign,
  setCampaignContent,
  sendTestEmail,
  ALWAYS_TEST_RECIPIENT,
} from "../lib/mailchimp.ts";
import { renderEshotHtml, replaceImageMarkers, ensureUnsubscribeFooter } from "../lib/eshot-template.ts";
import { structureEshot } from "../lib/eshot-ai.ts";

const [docxPath, ...imagePaths] = process.argv.slice(2);
if (!docxPath) {
  console.error("Usage: node --env-file=.env scripts/test-eshot.mjs <copy.docx> [images…]");
  process.exit(1);
}

// 1. Audiences + tags
const audiences = await listAudiences();
console.log(`✓ ${audiences.length} audiences:`, audiences.map((a) => a.name).join(", "));
const mepca = audiences.find((a) => a.name === "MEPCA");
if (!mepca) throw new Error("MEPCA audience not found");
const segments = await listSegments(mepca.id);
const staticSegs = segments.filter((s) => s.type === "static");
console.log(`✓ MEPCA has ${staticSegs.length} tags/static segments`);
const exclude = staticSegs.find((s) => s.name === "Mouser Seed");

// 2. Copy → Claude
const copyHtml = docxPath.endsWith(".docx")
  ? (await mammoth.convertToHtml({ buffer: await readFile(docxPath) })).value
  : await readFile(docxPath, "utf8");
console.log(`✓ read ${copyHtml.length} chars of copy HTML from the docx`);
const draft = await structureEshot(copyHtml, imagePaths.length);
console.log(`✓ Claude structured it:`);
console.log(`   subject: ${draft.subject}`);
console.log(`   preview: ${draft.previewText}`);
console.log(`   sender : ${draft.senderName}`);
console.log(`   ctaUrl : ${draft.ctaUrl}`);

// 3. Images → File Manager
const urls = [];
for (const p of imagePaths) {
  const b64 = (await readFile(p)).toString("base64");
  const name = `${Date.now()}-${p.split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { url } = await uploadImage(name, b64);
  console.log(`✓ uploaded ${p.split(/[\\/]/).pop()} → ${url}`);
  urls.push(url);
}

// 4. Assemble final HTML
let html = renderEshotHtml({ subject: draft.subject, bodyHtml: draft.bodyHtml, audienceName: mepca.name });
html = replaceImageMarkers(html, urls, draft.ctaUrl || "");
html = ensureUnsubscribeFooter(html, mepca.name);
console.log(`✓ final HTML assembled (${html.length} chars, unsub: ${html.includes("*|UNSUB|*")})`);

// 5. Draft campaign with an exclusion
const campaign = await createDraftCampaign({
  listId: mepca.id,
  subject: draft.subject,
  previewText: draft.previewText,
  title: `[Cogent Hub test v2 — email-safe/Lato] ${draft.senderName} — ${draft.subject}`,
  fromName: draft.senderName,
  replyTo: mepca.defaultFromEmail,
  excludeStaticSegmentIds: exclude ? [exclude.id] : [],
});
console.log(`✓ draft campaign created (excluding "${exclude?.name ?? "nothing"}")`);
console.log(`   edit: ${campaign.editUrl}`);

// 6. Content + test send
await setCampaignContent(campaign.id, html);
console.log("✓ content set");
const testTo = [ALWAYS_TEST_RECIPIENT, ...(process.env.EXTRA_TEST_EMAIL ? [process.env.EXTRA_TEST_EMAIL] : [])];
await sendTestEmail(campaign.id, testTo);
console.log(`✓ test email sent to ${testTo.join(", ")}`);
