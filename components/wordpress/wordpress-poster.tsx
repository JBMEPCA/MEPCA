"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { applyHouseStyle } from "@/lib/house-style";
import { editorialStyle } from "@/lib/editorial-style";

// ---- File text extraction (browser-side, lazy-loaded like the LinkedIn tab) ----

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  await doc.destroy();
  return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value.replace(/[ \t]+/g, " ").trim();
}

// For magazines that keep original hyperlinks, extract the .docx as HTML so the
// <a href> links survive (extractRawText drops them). Embedded images are
// stripped — mammoth would otherwise inline them as huge base64 data URIs.
async function extractDocxHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return value.replace(/<img[^>]*>/gi, "").replace(/[ \t]+/g, " ").trim();
}

// Legacy .doc (Word 97–2003) can't be parsed in the browser, so send the raw
// file to the server, which reads it with word-extractor.
async function extractDocText(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/wordpress/extract-doc", { method: "POST", body: fd });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(
      res.status === 413
        ? "That .doc file is too large to upload. Try re-saving it as .docx, or paste the text."
        : "Couldn't read that .doc file. Try re-saving it as .docx, or paste the text."
    );
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Couldn't read that .doc file.");
  return (data.text as string).trim();
}

async function extractText(file: File, preserveLinks: boolean): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdfText(file);
  if (name.endsWith(".docx")) return preserveLinks ? extractDocxHtml(file) : extractDocxText(file);
  if (name.endsWith(".doc")) return extractDocText(file);
  if (name.endsWith(".txt") || name.endsWith(".md")) return (await file.text()).trim();
  throw new Error("Unsupported file — use PDF, Word (.doc/.docx), TXT, or paste the text.");
}

// Vercel caps upload requests at ~4.5MB, and print-resolution photos exceed
// that. Shrink images in the browser to web resolution before uploading —
// keeps quality high while staying well under the limit. Returns the original
// untouched if it's already small enough.
async function downscaleImage(file: File, maxDim = 2200): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("Couldn't read the image."));
    fr.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Couldn't read the image."));
    im.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  // Already web-sized and comfortably under the limit — leave it as-is.
  if (scale === 1 && file.size <= 3_800_000) return file;

  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  // White backdrop so PNG/transparent images don't flatten to black as JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const encode = (quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

  let blob = await encode(0.85);
  // Extra safety for very detailed images: drop quality if still too big.
  if (blob && blob.size > 4_000_000) blob = (await encode(0.7)) ?? blob;
  if (!blob) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

// ---- Types ----

type Proposal = {
  title: string;
  category: string;
  categoryOptions: string[];
  hasCompanyTaxonomy: boolean;
  company: string;
  focusKeyphrase: string;
  metaDescription: string;
  excerpt: string;
  sourceUrl: string;
  bodyHtml: string;
  internalLinksFound: number;
  duplicates: { id: number; title: string; link: string; status: string; score: number }[];
};

type Stage = "input" | "review" | "done";

// ---- Component ----

export function WordPressPoster({ magazine }: { magazine: string }) {
  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [brandUrl, setBrandUrl] = useState("");

  const [feature, setFeature] = useState<File | null>(null);
  const [featurePreview, setFeaturePreview] = useState<string | null>(null);
  const [bodyImages, setBodyImages] = useState<File[]>([]);
  const [bodyPreviews, setBodyPreviews] = useState<string[]>([]);

  const [p, setP] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ editLink: string; link: string } | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const featureInput = useRef<HTMLInputElement>(null);
  const bodyInput = useRef<HTMLInputElement>(null);
  const [dragText, setDragText] = useState(false);
  const [dragFeature, setDragFeature] = useState(false);
  const [dragBody, setDragBody] = useState(false);

  async function onArticleFile(file: File) {
    setError(null);
    try {
      setStatus("Reading the file…");
      const t = await extractText(file, editorialStyle(magazine).preserveHyperlinks);
      if (t.length < 200) {
        setError("Couldn't read enough text — it may be a scanned image. Paste the text instead.");
        setStatus(null);
        return;
      }
      setText(t);
      setFileName(file.name);
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
      setStatus(null);
    }
  }

  function setFeatureFile(file: File | null) {
    if (featurePreview) URL.revokeObjectURL(featurePreview);
    setFeature(file);
    setFeaturePreview(file ? URL.createObjectURL(file) : null);
  }

  function addBodyFiles(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    setBodyImages((prev) => [...prev, ...imgs]);
    setBodyPreviews((prev) => [...prev, ...imgs.map((f) => URL.createObjectURL(f))]);
  }

  function removeBodyImage(i: number) {
    URL.revokeObjectURL(bodyPreviews[i]);
    setBodyImages((prev) => prev.filter((_, idx) => idx !== i));
    setBodyPreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function generate() {
    setError(null);
    if (text.trim().length < 200) {
      setError("Add the article text (paste it or drop a PDF/Word file) first.");
      return;
    }
    if (!feature) {
      setError("A feature image is required — drop one in the feature image box.");
      return;
    }
    setBusy(true);
    setStatus("Formatting the article, choosing SEO details and finding internal links… this can take up to a minute.");
    try {
      const res = await fetch("/api/wordpress/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ magazine, text, bodyImageCount: bodyImages.length, brandUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      const proposal = data as Proposal;
      // Show the title exactly as it will publish (uppercase for Hotel/Bar).
      if (editorialStyle(magazine).titleStyle === "upper") {
        proposal.title = proposal.title.toUpperCase();
      }
      setP(proposal);
      setStage("review");
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(file: File, alt: string): Promise<{ id: number; sourceUrl: string }> {
    const prepared = await downscaleImage(file);
    const fd = new FormData();
    fd.append("magazine", magazine);
    fd.append("file", prepared);
    fd.append("alt", alt);
    const res = await fetch("/api/wordpress/media", { method: "POST", body: fd });

    // The platform can reject an oversized request with plain text (not JSON),
    // so read defensively and surface a clear message.
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      if (res.status === 413) {
        throw new Error(
          `"${file.name}" is too large to upload even after resizing. Please use a smaller image.`
        );
      }
      throw new Error("Image upload failed. Please try a different image.");
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Image upload failed.");
    return data;
  }

  async function createDraft() {
    if (!p || !feature) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Uploading the feature image…");
      const featured = await uploadImage(feature, p.title);

      const uploadedBody: { sourceUrl: string; alt: string }[] = [];
      for (let i = 0; i < bodyImages.length; i++) {
        setStatus(`Uploading in-article image ${i + 1} of ${bodyImages.length}…`);
        const u = await uploadImage(bodyImages[i], p.title);
        uploadedBody.push({ sourceUrl: u.sourceUrl, alt: p.title });
      }

      setStatus("Creating the WordPress draft…");
      const res = await fetch("/api/wordpress/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          magazine,
          title: p.title,
          bodyHtml: p.bodyHtml,
          excerpt: p.excerpt,
          category: p.category,
          company: p.company,
          focusKeyphrase: p.focusKeyphrase,
          metaDescription: p.metaDescription,
          sourceUrl: p.sourceUrl,
          featuredMediaId: featured.id,
          bodyImages: uploadedBody,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the draft.");
        return;
      }
      setResult({ editLink: data.editLink, link: data.link });
      setStage("done");
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong creating the draft.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setStage("input");
    setText("");
    setFileName(null);
    setBrandUrl("");
    setFeatureFile(null);
    bodyPreviews.forEach((u) => URL.revokeObjectURL(u));
    setBodyImages([]);
    setBodyPreviews([]);
    setP(null);
    setResult(null);
    setError(null);
    setStatus(null);
  }

  // Build a visual preview of the body with markers resolved.
  function previewHtml(): string {
    if (!p) return "";
    let html = p.bodyHtml;
    html = p.sourceUrl
      ? html.replaceAll("[[SOURCE_URL]]", p.sourceUrl)
      : html.replace(/<a href="\[\[SOURCE_URL\]\]"[^>]*>(.*?)<\/a>/gis, "$1");
    bodyPreviews.forEach((url, i) => {
      html = html.replaceAll(
        `[[IMAGE_${i + 1}]]`,
        `<figure><img src="${url}" alt="" style="max-width:100%;border-radius:8px"/></figure>`
      );
    });
    html = html.replace(
      /\[\[IMAGE_\d+\]\]/g,
      `<div style="padding:12px;border:1px dashed var(--border);border-radius:8px;color:var(--muted-foreground);font-size:13px">Image placeholder — no image supplied</div>`
    );
    // Show the preview exactly as it will publish (house style enforced).
    return applyHouseStyle(html);
  }

  // ---------- INPUT STAGE ----------
  if (stage === "input") {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <div>
            <Label className="mb-1.5">Article text or file</Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragText(true);
              }}
              onDragLeave={() => setDragText(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragText(false);
                const f = e.dataTransfer.files?.[0];
                if (f) onArticleFile(f);
              }}
              onClick={() => fileInput.current?.click()}
              className={`mb-2 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                dragText ? "border-primary bg-primary/5" : "border-input hover:border-muted-foreground/50"
              }`}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.docx,.doc,application/msword,.txt,.md"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && onArticleFile(e.target.files[0])}
              />
              <p className="text-sm font-medium">{fileName ?? "Drop a PDF, Word (.doc/.docx) or text file"}</p>
              <p className="mt-1 text-xs text-muted-foreground">or paste the text below</p>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the article or press release here…"
              className="min-h-40 font-sans"
            />
          </div>

          <div>
            <Label className="mb-1.5">
              Brand website <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              type="url"
              value={brandUrl}
              onChange={(e) => setBrandUrl(e.target.value)}
              placeholder="https://brand.com — only used if no source link is in the text"
            />
          </div>
        </div>

        <div className="space-y-5">
          {/* Feature image (required) */}
          <div>
            <Label className="mb-1.5">
              Feature image <span className="font-normal text-destructive">*required</span>
            </Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragFeature(true);
              }}
              onDragLeave={() => setDragFeature(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragFeature(false);
                const f = e.dataTransfer.files?.[0];
                if (f?.type.startsWith("image/")) setFeatureFile(f);
              }}
              onClick={() => featureInput.current?.click()}
              className={`flex min-h-40 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                dragFeature ? "border-primary bg-primary/5" : "border-input hover:border-muted-foreground/50"
              }`}
            >
              <input
                ref={featureInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setFeatureFile(e.target.files[0])}
              />
              {featurePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featurePreview} alt="feature" className="max-h-40 rounded-md object-contain" />
              ) : (
                <>
                  <p className="text-sm font-medium">Drop the feature image</p>
                  <p className="mt-1 text-xs text-muted-foreground">used as the post thumbnail</p>
                </>
              )}
            </div>
            {feature && (
              <button
                onClick={() => setFeatureFile(null)}
                className="mt-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Remove feature image
              </button>
            )}
          </div>

          {/* Body images (optional) */}
          <div>
            <Label className="mb-1.5">
              In-article images <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragBody(true);
              }}
              onDragLeave={() => setDragBody(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragBody(false);
                addBodyFiles(Array.from(e.dataTransfer.files ?? []));
              }}
              onClick={() => bodyInput.current?.click()}
              className={`flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                dragBody ? "border-primary bg-primary/5" : "border-input hover:border-muted-foreground/50"
              }`}
            >
              <input
                ref={bodyInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => addBodyFiles(Array.from(e.target.files ?? []))}
              />
              <p className="text-sm font-medium">Drop one or more images for the body</p>
              <p className="mt-1 text-xs text-muted-foreground">the AI places these through the article</p>
            </div>
            {bodyPreviews.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {bodyPreviews.map((url, i) => (
                  <div key={url} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-16 w-16 rounded-md object-cover" />
                    <button
                      onClick={() => removeBodyImage(i)}
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Remove image"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {status && <p className="text-sm text-primary">{status}</p>}
          <Button onClick={generate} disabled={busy} size="lg">
            {busy ? "Working…" : "Draft article →"}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- REVIEW STAGE ----------
  if (stage === "review" && p) {
    const metaLen = p.metaDescription.length;
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Review before publishing</h2>
            <Button variant="ghost" size="sm" onClick={() => setStage("input")}>
              ← Back to inputs
            </Button>
          </div>

          {p.duplicates?.length > 0 && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="text-sm font-semibold text-amber-500">⚠️ Already posted story</p>
              <p className="mt-1 text-xs text-muted-foreground">
                A very similar article is already on the site. Check it&apos;s not a duplicate before
                publishing — or carry on if this is intentional.
              </p>
              <ul className="mt-2 space-y-1">
                {p.duplicates.map((d) => (
                  <li key={d.id} className="text-xs">
                    <a
                      href={d.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {d.title}
                    </a>{" "}
                    <span className="text-muted-foreground">
                      ({d.status === "publish" ? "published" : d.status}
                      {" · "}
                      {Math.round(d.score * 100)}% match)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <Label className="mb-1.5">Title</Label>
            <Input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} />
          </div>

          <div className={`grid gap-3 ${p.hasCompanyTaxonomy ? "grid-cols-2" : "grid-cols-1"}`}>
            <div>
              <Label className="mb-1.5">Category</Label>
              <select
                value={p.category}
                onChange={(e) => setP({ ...p, category: e.target.value })}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              >
                {p.categoryOptions.map((c) => (
                  <option key={c} value={c} className="bg-popover text-popover-foreground">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {p.hasCompanyTaxonomy && (
              <div>
                <Label className="mb-1.5">Company</Label>
                <Input value={p.company} onChange={(e) => setP({ ...p, company: e.target.value })} />
              </div>
            )}
          </div>

          <div>
            <Label className="mb-1.5">
              Brand source link{" "}
              {!p.sourceUrl && <span className="font-normal text-amber-500">— none found, add one</span>}
            </Label>
            <Input
              type="url"
              value={p.sourceUrl}
              onChange={(e) => setP({ ...p, sourceUrl: e.target.value })}
              placeholder="https://brand.com/…"
            />
          </div>

          <div className="rounded-lg border border-border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Yoast SEO
            </p>
            <div className="space-y-3">
              <div>
                <Label className="mb-1.5">Focus keyphrase</Label>
                <Input
                  value={p.focusKeyphrase}
                  onChange={(e) => setP({ ...p, focusKeyphrase: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-1.5 justify-between">
                  <span>Meta description</span>
                  <span className={`text-xs ${metaLen > 155 ? "text-destructive" : "text-muted-foreground"}`}>
                    {metaLen}/155
                  </span>
                </Label>
                <Textarea
                  value={p.metaDescription}
                  onChange={(e) => setP({ ...p, metaDescription: e.target.value })}
                  className="min-h-16 font-sans"
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="mb-1.5">Excerpt</Label>
            <Textarea
              value={p.excerpt}
              onChange={(e) => setP({ ...p, excerpt: e.target.value })}
              className="min-h-16 font-sans"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {status && <p className="text-sm text-primary">{status}</p>}
          <Button onClick={createDraft} disabled={busy} size="lg" className="w-full">
            {busy ? "Working…" : "Create WordPress draft"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Saved as a draft — you do the final check and hit Publish in WordPress yourself.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Article preview</Label>
            <span className="text-xs text-muted-foreground">
              {p.internalLinksFound > 0
                ? `${p.internalLinksFound} related article${p.internalLinksFound === 1 ? "" : "s"} found for internal links`
                : "No internal-link matches found"}
            </span>
          </div>
          <Card>
            <CardContent className="max-h-[42rem] overflow-y-auto p-6">
              <article className="wp-preview space-y-3 text-sm leading-relaxed">
                <h1 className="text-xl font-bold">{p.title}</h1>
                {featurePreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={featurePreview} alt="feature" className="w-full rounded-md" />
                )}
                <div
                  className="space-y-3 [&_a]:text-primary [&_a]:underline [&_h4]:mt-4 [&_h4]:text-base [&_h4]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:text-base [&_blockquote]:font-medium [&_blockquote]:italic [&_figure.wp-block-pullquote]:my-4"
                  dangerouslySetInnerHTML={{ __html: previewHtml() }}
                />
              </article>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---------- DONE STAGE ----------
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="text-4xl">✓</div>
        <h2 className="text-lg font-semibold">Draft created in WordPress</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Everything is filled in — title, formatting, category, images and the Yoast SEO box.
          Open it, give it a final look, and hit <strong>Publish</strong> when you&apos;re happy.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {result && (
            <a href={result.editLink} target="_blank" rel="noopener noreferrer">
              <Button size="lg">Open draft in WordPress →</Button>
            </a>
          )}
          <Button variant="outline" size="lg" onClick={reset}>
            Post another article
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
