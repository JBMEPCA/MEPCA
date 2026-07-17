import { uploadMedia, hasWordPressCreds } from "@/lib/wordpress";

// Uploads a single image to the WordPress Media Library. One image per request
// keeps each payload well under Vercel's body limit. The app password stays
// server-side — the browser never sees it.
export const maxDuration = 60;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const magazine = ((form.get("magazine") as string | null) ?? "mepca").trim();
  if (!hasWordPressCreds(magazine)) {
    return Response.json({ error: "WordPress isn't connected for this magazine yet." }, { status: 400 });
  }

  const file = form.get("file");
  const alt = (form.get("alt") as string | null) ?? "";
  if (!(file instanceof File)) {
    return Response.json({ error: "No image was provided." }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "That file isn't an image." }, { status: 400 });
  }
  if (file.size > 12 * 1024 * 1024) {
    return Response.json({ error: "Image is too large (max 12MB). Please resize it." }, { status: 400 });
  }

  try {
    const data = await file.arrayBuffer();
    const media = await uploadMedia(magazine, data, file.name, file.type, alt || undefined);
    return Response.json({ id: media.id, sourceUrl: media.sourceUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
