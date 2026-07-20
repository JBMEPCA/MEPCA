import { hasMailchimpCreds } from "@/lib/mailchimp";
import { structureEshot, extractEshotMeta } from "@/lib/eshot-ai";
import { renderEshotHtml } from "@/lib/eshot-template";

// Builds the in-app draft proposal JB reviews — nothing is written to
// Mailchimp here. Two modes:
// - "files": client copy (text/HTML extracted in the browser) + image count →
//   Claude structures it into the house shell with [[IMAGE_n]] markers.
// - "html": a finished client HTML e-shot → passed through untouched, Claude
//   only suggests subject / preview text / sender name.
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: {
    mode?: string;
    content?: string;
    imageCount?: number;
    brandUrl?: string;
    audienceName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!hasMailchimpCreds()) {
    return Response.json({ error: "Mailchimp isn't connected yet." }, { status: 400 });
  }

  const mode = body.mode === "html" ? "html" : "files";
  const content = (body.content ?? "").trim();
  const imageCount = Math.max(0, Math.min(10, Number(body.imageCount) || 0));
  const brandUrl = (body.brandUrl ?? "").trim();

  if (mode === "html" && content.length < 100) {
    return Response.json({ error: "Drop or paste the e-shot HTML first." }, { status: 400 });
  }
  if (mode === "files" && content.length < 100) {
    return Response.json(
      { error: "Couldn't read enough copy. Paste the text or drop a text-based Word/PDF file." },
      { status: 400 }
    );
  }

  try {
    if (mode === "html") {
      const meta = await extractEshotMeta(content);
      return Response.json({
        subject: meta.subject,
        previewText: meta.previewText,
        senderName: meta.senderName,
        linkUrl: "",
        html: content,
      });
    }

    const draft = await structureEshot(content, imageCount, brandUrl || undefined);
    const html = renderEshotHtml({
      subject: draft.subject,
      bodyHtml: draft.bodyHtml,
      audienceName: body.audienceName,
    });
    return Response.json({
      subject: draft.subject,
      previewText: draft.previewText,
      senderName: draft.senderName,
      // House rule: every image links somewhere — CTA first, brand URL second.
      linkUrl: (draft.ctaUrl ?? "").trim() || brandUrl,
      html,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong drafting the e-shot.";
    return Response.json({ error: message }, { status: 500 });
  }
}
