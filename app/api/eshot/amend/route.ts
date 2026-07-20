import { hasMailchimpCreds } from "@/lib/mailchimp";
import { amendEshot } from "@/lib/eshot-ai";

// One turn of the review-stage amend chat: "make the title bigger", "change
// the button to Get a quote", "swap the link to …". Only the in-app proof is
// touched — Mailchimp isn't involved until Create is pressed.
export const maxDuration = 120;

export async function POST(request: Request) {
  let body: {
    html?: string;
    subject?: string;
    previewText?: string;
    senderName?: string;
    linkUrl?: string;
    instruction?: string;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!hasMailchimpCreds()) {
    return Response.json({ error: "Mailchimp isn't connected yet." }, { status: 400 });
  }

  const instruction = (body.instruction ?? "").trim();
  const html = (body.html ?? "").trim();
  if (!instruction) {
    return Response.json({ error: "Type what you'd like changed first." }, { status: 400 });
  }
  if (html.length < 50) {
    return Response.json({ error: "There's no proof to amend yet." }, { status: 400 });
  }

  try {
    const amended = await amendEshot({
      html,
      subject: body.subject ?? "",
      previewText: body.previewText ?? "",
      senderName: body.senderName ?? "",
      linkUrl: body.linkUrl ?? "",
      instruction,
    });

    // Belt and braces: if the model dropped image markers, keep the original
    // HTML rather than losing images from the proof.
    const markers = (s: string) => (s.match(/\[\[IMAGE_\d+\]\]/g) ?? []).length;
    if (markers(amended.html) !== markers(html)) {
      amended.html = html;
      amended.note = `${amended.note} (Layout change was rejected because it lost an image placeholder — try rewording.)`;
    }

    return Response.json(amended);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't apply that amend.";
    return Response.json({ error: message }, { status: 500 });
  }
}
