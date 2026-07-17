import WordExtractor from "word-extractor";

// Extracts text from a legacy binary Word document (.doc, Word 97–2003).
// Server-only: word-extractor parses the OLE compound-file format in Node,
// which the browser can't do — unlike .docx, which mammoth reads client-side.

let _extractor: WordExtractor | null = null;
function extractor(): WordExtractor {
  _extractor ??= new WordExtractor();
  return _extractor;
}

export async function extractDocText(data: ArrayBuffer): Promise<string> {
  const doc = await extractor().extract(Buffer.from(data));
  return (doc.getBody() ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
