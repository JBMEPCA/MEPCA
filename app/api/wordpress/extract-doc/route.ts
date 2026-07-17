import { extractDocText } from "@/lib/doc-extract";

// Extracts text from an uploaded legacy .doc file. .doc can't be parsed in the
// browser (unlike .docx/PDF), so the raw file is sent here and the text goes
// back for the normal drafting flow. Nothing is sent to WordPress.
export const maxDuration = 30;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was provided." }, { status: 400 });
  }
  if (file.size > 15 * 1024 * 1024) {
    return Response.json({ error: "That .doc is too large (max 15MB)." }, { status: 400 });
  }

  try {
    const text = await extractDocText(await file.arrayBuffer());
    if (text.trim().length < 20) {
      return Response.json(
        { error: "Couldn't read text from that .doc — it may be empty or scanned. Try re-saving it as .docx, or paste the text." },
        { status: 422 }
      );
    }
    return Response.json({ text });
  } catch {
    return Response.json(
      { error: "Couldn't read that .doc file. If it opens in Word, try re-saving it as .docx and dropping that instead." },
      { status: 422 }
    );
  }
}
