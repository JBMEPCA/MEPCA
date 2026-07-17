import { generateLinkedInPost, type PostMode } from "@/lib/linkedin";

// PDF text is extracted in the browser and posted here as JSON, so the payload
// stays small (well under Vercel's request body limit) even for a whole issue.
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { magazine?: string; mode?: string; text?: string; issueLink?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const magazine = (body.magazine ?? "mepca").trim();
  const mode: PostMode = body.mode === "issue" ? "issue" : "article";
  const text = (body.text ?? "").trim();
  const issueLink = (body.issueLink ?? "").trim();

  if (text.length < 200) {
    return Response.json(
      { error: "Couldn't read enough text from that PDF. Is it a scanned image rather than a text PDF?" },
      { status: 400 }
    );
  }

  try {
    const post = await generateLinkedInPost(magazine, mode, text, issueLink);
    return Response.json({ post });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Something went wrong generating the post.";
    return Response.json({ error: message }, { status: 500 });
  }
}
