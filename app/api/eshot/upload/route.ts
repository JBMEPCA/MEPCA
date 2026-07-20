import { hasMailchimpCreds, uploadImage } from "@/lib/mailchimp";

// Uploads one image to the Mailchimp File Manager so it's hosted where the
// e-shot can reference it. One image per request keeps each payload well
// under Vercel's body limit; the browser downscales first.
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!hasMailchimpCreds()) {
    return Response.json({ error: "Mailchimp isn't connected yet." }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No image was provided." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "That file isn't an image." }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return Response.json({ error: "Image is too large (max 8MB). Please resize it." }, { status: 400 });
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    // Timestamp prefix keeps File Manager names unique across campaigns.
    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { url } = await uploadImage(safeName, base64);
    return Response.json({ url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
