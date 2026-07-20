import { hasMailchimpCreds, listAudiences } from "@/lib/mailchimp";

// The Builder's audience dropdown, loaded live from Mailchimp so new
// audiences appear without a code change.
export async function GET() {
  if (!hasMailchimpCreds()) {
    return Response.json({ error: "Mailchimp isn't connected yet." }, { status: 400 });
  }
  try {
    return Response.json({ audiences: await listAudiences() });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't load Mailchimp audiences.";
    return Response.json({ error: message }, { status: 500 });
  }
}
