import { hasMailchimpCreds, listSegments } from "@/lib/mailchimp";

// Tags + segments for the selected audience, for the "exclude" picker.
// Only static segments (which is what Mailchimp tags are under the hood) can
// be excluded from a send via the API, so the Builder filters to those.
export async function GET(request: Request) {
  if (!hasMailchimpCreds()) {
    return Response.json({ error: "Mailchimp isn't connected yet." }, { status: 400 });
  }
  const listId = new URL(request.url).searchParams.get("list")?.trim();
  if (!listId) {
    return Response.json({ error: "No audience given." }, { status: 400 });
  }
  try {
    const segments = await listSegments(listId);
    return Response.json({ segments: segments.filter((s) => s.type === "static") });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't load tags for that audience.";
    return Response.json({ error: message }, { status: 500 });
  }
}
