"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { replaceImageMarkers } from "@/lib/eshot-template";

// The E-shot Builder: drag in either a finished client HTML e-shot, or the
// raw pieces (copy + images), review the draft in-app, then create it as a
// Mailchimp DRAFT with test emails fired to digital@cimltd.co.uk (always)
// plus an optional second address. Lives at Cogent level — the audience is a
// dropdown, not a magazine tab.

// ---- File text extraction (browser-side, lazy-loaded like the other tabs) ----

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

// Unlike the WordPress Poster, e-shot copy keeps its links and bold — clients
// approve the exact wording INCLUDING tracking URLs, so .docx is converted to
// HTML rather than flattened to plain text.
async function extractDocxHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return value.trim();
}

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

async function extractCopy(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return extractPdfText(file);
  if (name.endsWith(".docx")) return extractDocxHtml(file);
  if (name.endsWith(".doc")) return extractDocText(file);
  if (name.endsWith(".txt") || name.endsWith(".md")) return (await file.text()).trim();
  throw new Error("Unsupported file — use PDF, Word (.doc/.docx), TXT, or paste the text.");
}

// Emails display at 600px, so 1200px covers retina screens while keeping the
// send light and comfortably under Vercel's upload cap.
async function downscaleImage(file: File, maxDim = 1200): Promise<File> {
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
  if (scale === 1 && file.size <= 1_500_000) return file;

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
  const blob = await encode(0.85);
  if (!blob) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

// Local image references inside dropped client HTML (src="banner.png" rather
// than a hosted URL) — these need matching image files dropped alongside.
function findLocalImageRefs(html: string): string[] {
  const refs = new Set<string>();
  for (const m of html.matchAll(/src\s*=\s*["']([^"']+)["']/gi)) {
    const src = m[1].trim();
    if (/^(https?:|data:|cid:|\/\/|\*\|)/i.test(src)) continue;
    refs.add(src);
  }
  return [...refs];
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop()?.toLowerCase() ?? path.toLowerCase();
}

// ---- Types ----

type Audience = {
  id: string;
  name: string;
  memberCount: number;
  defaultFromName: string;
  defaultFromEmail: string;
};

type Seg = { id: number; name: string; memberCount: number };

type Proposal = {
  subject: string;
  previewText: string;
  senderName: string;
  // Every image in a built e-shot links here (CTA or client homepage).
  linkUrl: string;
  html: string;
};

type Stage = "input" | "review" | "done";
type Mode = "files" | "html";

// ---- Component ----

export function EshotBuilder() {
  const [stage, setStage] = useState<Stage>("input");
  const [mode, setMode] = useState<Mode>("files");

  // Audience + exclusions
  const [audiences, setAudiences] = useState<Audience[] | null>(null);
  const [audienceId, setAudienceId] = useState("");
  const [segments, setSegments] = useState<Seg[]>([]);
  const [segsLoading, setSegsLoading] = useState(false);
  const [excludeIds, setExcludeIds] = useState<number[]>([]);
  const [showExclude, setShowExclude] = useState(false);

  // "Build from files" inputs
  const [copy, setCopy] = useState("");
  const [copyFileName, setCopyFileName] = useState<string | null>(null);
  const [brandUrl, setBrandUrl] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  // "Complete HTML" inputs (shares the images drop for local references)
  const [htmlText, setHtmlText] = useState("");
  const [htmlFileName, setHtmlFileName] = useState<string | null>(null);

  // Review fields
  const [p, setP] = useState<Proposal | null>(null);
  const [replyTo, setReplyTo] = useState("");
  const [sendDate, setSendDate] = useState("");
  const [extraTestEmail, setExtraTestEmail] = useState("");

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    editUrl: string;
    testedTo: string[];
    testError: string | null;
  } | null>(null);

  const copyInput = useRef<HTMLInputElement>(null);
  const htmlInput = useRef<HTMLInputElement>(null);
  const imagesInput = useRef<HTMLInputElement>(null);
  const [dragCopy, setDragCopy] = useState(false);
  const [dragHtml, setDragHtml] = useState(false);
  const [dragImages, setDragImages] = useState(false);

  // ---- Audience + tag loading ----

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/eshot/audiences");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error ?? "Couldn't load Mailchimp audiences.");
          return;
        }
        setAudiences(data.audiences);
      } catch {
        if (!cancelled) setError("Couldn't reach Mailchimp — check the connection and refresh.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSegments([]);
    setExcludeIds([]);
    if (!audienceId) return;
    let cancelled = false;
    setSegsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/eshot/segments?list=${encodeURIComponent(audienceId)}`);
        const data = await res.json();
        if (!cancelled && res.ok) setSegments(data.segments);
      } catch {
        // Exclusions are optional — a load failure shouldn't block drafting.
      } finally {
        if (!cancelled) setSegsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [audienceId]);

  const audience = audiences?.find((a) => a.id === audienceId) ?? null;

  // ---- Input handlers ----

  async function onCopyFile(file: File) {
    setError(null);
    try {
      setStatus("Reading the file…");
      const t = await extractCopy(file);
      if (t.length < 100) {
        setError("Couldn't read enough text — it may be a scanned image. Paste the copy instead.");
        setStatus(null);
        return;
      }
      setCopy(t);
      setCopyFileName(file.name);
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
      setStatus(null);
    }
  }

  async function onHtmlFile(file: File) {
    setError(null);
    const text = (await file.text()).trim();
    // Guards against exactly what happened with the first example JB sent:
    // an image renamed .html — binary data instead of markup.
    if (!/<[a-z][\s\S]*>/i.test(text) || text.slice(0, 500).includes("�")) {
      setError(
        `"${file.name}" doesn't look like an HTML file. If it came from the client, check it opens in a browser first.`
      );
      return;
    }
    setHtmlText(text);
    setHtmlFileName(file.name);
  }

  function addImages(files: File[]) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    setImages((prev) => [...prev, ...imgs]);
    setImagePreviews((prev) => [...prev, ...imgs.map((f) => URL.createObjectURL(f))]);
  }

  function removeImage(i: number) {
    URL.revokeObjectURL(imagePreviews[i]);
    setImages((prev) => prev.filter((_, idx) => idx !== i));
    setImagePreviews((prev) => prev.filter((_, idx) => idx !== i));
  }

  const localRefs = mode === "html" ? findLocalImageRefs(htmlText) : [];
  const unmatchedRefs = localRefs.filter(
    (ref) => !images.some((f) => f.name.toLowerCase() === baseName(ref))
  );

  // ---- Draft (AI prefill) ----

  async function generate() {
    setError(null);
    if (!audienceId) {
      setError("Choose the audience this e-shot goes to first.");
      return;
    }
    const content = mode === "html" ? htmlText.trim() : copy.trim();
    if (content.length < 100) {
      setError(
        mode === "html"
          ? "Drop the e-shot HTML file (or paste the HTML) first."
          : "Add the e-shot copy — drop a Word/PDF file or paste the text."
      );
      return;
    }
    setBusy(true);
    setStatus(
      mode === "html"
        ? "Reading the e-shot and suggesting subject, preview text and sender…"
        : "Building the e-shot and filling in subject, preview text and sender… this can take up to a minute."
    );
    try {
      const res = await fetch("/api/eshot/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          content,
          imageCount: mode === "files" ? images.length : 0,
          brandUrl,
          audienceName: audience?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setP(data as Proposal);
      setReplyTo(audience?.defaultFromEmail ?? "");
      setStage("review");
      setStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Preview HTML with local images resolved to object URLs ----

  function previewHtml(): string {
    if (!p) return "";
    if (mode === "files") return replaceImageMarkers(p.html, imagePreviews, p.linkUrl.trim());
    let html = p.html;
    localRefs.forEach((ref) => {
      const idx = images.findIndex((f) => f.name.toLowerCase() === baseName(ref));
      if (idx >= 0) html = html.replaceAll(ref, imagePreviews[idx]);
    });
    return html;
  }

  // ---- Create in Mailchimp ----

  async function uploadOne(file: File): Promise<string> {
    const prepared = await downscaleImage(file);
    const fd = new FormData();
    fd.append("file", prepared);
    const res = await fetch("/api/eshot/upload", { method: "POST", body: fd });
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      throw new Error(
        res.status === 413
          ? `"${file.name}" is too large to upload even after resizing. Please use a smaller image.`
          : "Image upload failed. Please try a different image."
      );
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Image upload failed.");
    return data.url as string;
  }

  async function createDraft() {
    if (!p) return;
    if (mode === "html" && unmatchedRefs.length > 0) {
      setError(
        `The HTML references image files that haven't been dropped in: ${unmatchedRefs.join(", ")}. Add them to the images box (matching file names) or fix the HTML.`
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let finalHtml = p.html;
      if (mode === "files") {
        const urls: string[] = [];
        for (let i = 0; i < images.length; i++) {
          setStatus(`Uploading image ${i + 1} of ${images.length} to Mailchimp…`);
          urls.push(await uploadOne(images[i]));
        }
        finalHtml = replaceImageMarkers(finalHtml, urls, p.linkUrl.trim());
      } else {
        for (let i = 0; i < localRefs.length; i++) {
          const ref = localRefs[i];
          const idx = images.findIndex((f) => f.name.toLowerCase() === baseName(ref));
          if (idx < 0) continue;
          setStatus(`Uploading image ${i + 1} of ${localRefs.length} to Mailchimp…`);
          const url = await uploadOne(images[idx]);
          finalHtml = finalHtml.replaceAll(ref, url);
        }
      }

      setStatus("Creating the Mailchimp draft and sending the tests…");
      const res = await fetch("/api/eshot/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listId: audienceId,
          audienceName: audience?.name,
          excludeSegmentIds: excludeIds,
          subject: p.subject,
          previewText: p.previewText,
          fromName: p.senderName,
          replyTo,
          sendDate,
          html: finalHtml,
          extraTestEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't create the draft.");
        return;
      }
      setResult(data);
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
    setCopy("");
    setCopyFileName(null);
    setBrandUrl("");
    setHtmlText("");
    setHtmlFileName(null);
    imagePreviews.forEach((u) => URL.revokeObjectURL(u));
    setImages([]);
    setImagePreviews([]);
    setExcludeIds([]);
    setP(null);
    setReplyTo("");
    setSendDate("");
    setExtraTestEmail("");
    setResult(null);
    setError(null);
    setStatus(null);
  }

  const excludedCount = excludeIds.length;

  // ---- Shared: audience + exclusions block ----

  function audiencePicker(compact: boolean) {
    return (
      <div className={compact ? "grid gap-3 sm:grid-cols-2" : "space-y-3"}>
        <div>
          <Label className="mb-1.5">Audience</Label>
          <select
            value={audienceId}
            onChange={(e) => setAudienceId(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="" className="bg-popover text-popover-foreground">
              {audiences ? "Choose an audience…" : "Loading audiences…"}
            </option>
            {(audiences ?? []).map((a) => (
              <option key={a.id} value={a.id} className="bg-popover text-popover-foreground">
                {a.name} — {a.memberCount.toLocaleString()} contacts
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="mb-1.5">
            Don&apos;t send to <span className="font-normal text-muted-foreground">(tags/segments, optional)</span>
          </Label>
          <button
            type="button"
            onClick={() => setShowExclude((s) => !s)}
            disabled={!audienceId}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-left text-sm outline-none disabled:opacity-50 dark:bg-input/30"
          >
            {!audienceId
              ? "Choose an audience first"
              : segsLoading
                ? "Loading tags…"
                : excludedCount > 0
                  ? `Excluding ${excludedCount} tag${excludedCount === 1 ? "" : "s"}`
                  : segments.length > 0
                    ? "No exclusions — click to choose"
                    : "This audience has no tags"}
          </button>
          {showExclude && segments.length > 0 && (
            <div className="mt-1.5 max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border p-2">
              {segments.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
                >
                  <input
                    type="checkbox"
                    checked={excludeIds.includes(s.id)}
                    onChange={(e) =>
                      setExcludeIds((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                      )
                    }
                  />
                  <span className="flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.memberCount.toLocaleString()}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- INPUT STAGE ----------
  if (stage === "input") {
    return (
      <div className="space-y-6">
        {audiencePicker(true)}

        {/* Mode switch */}
        <div className="flex gap-2">
          {(
            [
              ["files", "Build from copy + images"],
              ["html", "I have the complete HTML"],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                mode === m
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-input text-muted-foreground hover:border-muted-foreground/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            {mode === "files" ? (
              <>
                <div>
                  <Label className="mb-1.5">E-shot copy or file</Label>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragCopy(true);
                    }}
                    onDragLeave={() => setDragCopy(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragCopy(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) onCopyFile(f);
                    }}
                    onClick={() => copyInput.current?.click()}
                    className={`mb-2 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                      dragCopy ? "border-primary bg-primary/5" : "border-input hover:border-muted-foreground/50"
                    }`}
                  >
                    <input
                      ref={copyInput}
                      type="file"
                      accept=".pdf,.docx,.doc,application/msword,.txt,.md"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && onCopyFile(e.target.files[0])}
                    />
                    <p className="text-sm font-medium">
                      {copyFileName ?? "Drop the client's Word (.doc/.docx), PDF or text file"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      links and subject line are picked up automatically — or paste below
                    </p>
                  </div>
                  <Textarea
                    value={copy}
                    onChange={(e) => setCopy(e.target.value)}
                    placeholder="Or paste the e-shot copy here…"
                    className="min-h-36 font-sans"
                  />
                </div>
                <div>
                  <Label className="mb-1.5">
                    Client website / CTA link <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    type="url"
                    value={brandUrl}
                    onChange={(e) => setBrandUrl(e.target.value)}
                    placeholder="https://client.com — used for the button if the copy has no link"
                  />
                </div>
              </>
            ) : (
              <div>
                <Label className="mb-1.5">Complete e-shot HTML</Label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragHtml(true);
                  }}
                  onDragLeave={() => setDragHtml(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragHtml(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f) onHtmlFile(f);
                  }}
                  onClick={() => htmlInput.current?.click()}
                  className={`mb-2 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                    dragHtml ? "border-primary bg-primary/5" : "border-input hover:border-muted-foreground/50"
                  }`}
                >
                  <input
                    ref={htmlInput}
                    type="file"
                    accept=".html,.htm"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onHtmlFile(e.target.files[0])}
                  />
                  <p className="text-sm font-medium">{htmlFileName ?? "Drop the client's .html file"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">or paste the HTML below</p>
                </div>
                <Textarea
                  value={htmlText}
                  onChange={(e) => setHtmlText(e.target.value)}
                  placeholder="<html>… the finished e-shot markup …</html>"
                  className="min-h-36 font-mono text-xs"
                />
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <Label className="mb-1.5">
                Images{" "}
                <span className="font-normal text-muted-foreground">
                  {mode === "files"
                    ? "(first one becomes the top banner)"
                    : "(only needed if the HTML references local image files)"}
                </span>
              </Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragImages(true);
                }}
                onDragLeave={() => setDragImages(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragImages(false);
                  addImages(Array.from(e.dataTransfer.files ?? []));
                }}
                onClick={() => imagesInput.current?.click()}
                className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                  dragImages ? "border-primary bg-primary/5" : "border-input hover:border-muted-foreground/50"
                }`}
              >
                <input
                  ref={imagesInput}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addImages(Array.from(e.target.files ?? []))}
                />
                <p className="text-sm font-medium">Drop the e-shot images</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  they&apos;re hosted in Mailchimp&apos;s File Manager automatically
                </p>
              </div>
              {imagePreviews.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {imagePreviews.map((url, i) => (
                    <div key={url} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-16 w-24 rounded-md object-cover" />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {mode === "html" && unmatchedRefs.length > 0 && (
                <p className="mt-2 text-xs text-amber-500">
                  The HTML references {unmatchedRefs.length} local image file
                  {unmatchedRefs.length === 1 ? "" : "s"} not dropped in yet: {unmatchedRefs.join(", ")}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {status && <p className="text-sm text-primary">{status}</p>}
          <Button onClick={generate} disabled={busy} size="lg">
            {busy ? "Working…" : "Draft e-shot →"}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- REVIEW STAGE ----------
  if (stage === "review" && p) {
    const previewLen = p.previewText.length;
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Review before creating the draft</h2>
            <Button variant="ghost" size="sm" onClick={() => setStage("input")}>
              ← Back to inputs
            </Button>
          </div>

          <div className="rounded-lg border border-border p-3 text-sm">
            <p>
              <span className="text-muted-foreground">Sending to:</span>{" "}
              <span className="font-medium">{audience?.name}</span>{" "}
              <span className="text-muted-foreground">
                ({audience?.memberCount.toLocaleString()} contacts
                {excludedCount > 0
                  ? `, excluding ${excludedCount} tag${excludedCount === 1 ? "" : "s"}`
                  : ""}
                )
              </span>
            </p>
          </div>

          <div>
            <Label className="mb-1.5">Subject line</Label>
            <Input value={p.subject} onChange={(e) => setP({ ...p, subject: e.target.value })} />
          </div>

          <div>
            <Label className="mb-1.5 justify-between">
              <span>Preview text (shows after the subject in the inbox)</span>
              <span className={`text-xs ${previewLen > 150 ? "text-destructive" : "text-muted-foreground"}`}>
                {previewLen}/150
              </span>
            </Label>
            <Textarea
              value={p.previewText}
              onChange={(e) => setP({ ...p, previewText: e.target.value })}
              className="min-h-14 font-sans"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">Sender name (the From name)</Label>
              <Input
                value={p.senderName}
                onChange={(e) => setP({ ...p, senderName: e.target.value })}
                placeholder="Usually the client company"
              />
            </div>
            <div>
              <Label className="mb-1.5">Reply-to email</Label>
              <Input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
            </div>
          </div>

          {mode === "files" && (
            <div>
              <Label className="mb-1.5">
                Images link to{" "}
                <span className="font-normal text-muted-foreground">
                  (every image is clickable — the CTA or the client&apos;s homepage)
                </span>
              </Label>
              <Input
                type="url"
                value={p.linkUrl}
                onChange={(e) => setP({ ...p, linkUrl: e.target.value })}
                placeholder="https://client.com"
              />
              {!p.linkUrl.trim() && (
                <p className="mt-1 text-xs text-amber-500">
                  No link found in the copy — add one so the images aren&apos;t dead ends.
                </p>
              )}
            </div>
          )}

          {mode === "html" &&
            (() => {
              const total = (p.html.match(/<img/gi) ?? []).length;
              const linked = (p.html.match(/<a[^>]*>[\s\S]{0,200}?<img/gi) ?? []).length;
              return total > linked ? (
                <p className="text-xs text-amber-500">
                  Heads-up: {total - linked} of the {total} images in this HTML don&apos;t appear to
                  be linked. House style is every image clickable — worth checking with the client.
                </p>
              ) : null;
            })()}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">
                Intended send date <span className="font-normal text-muted-foreground">(noted on the draft)</span>
              </Label>
              <Input type="date" value={sendDate} onChange={(e) => setSendDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5">
                Second test email <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                type="email"
                value={extraTestEmail}
                onChange={(e) => setExtraTestEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-accent/40 p-3 text-xs text-muted-foreground">
            A test email always goes to <strong className="text-foreground">digital@cimltd.co.uk</strong>
            {extraTestEmail.trim() ? (
              <>
                {" "}
                and <strong className="text-foreground">{extraTestEmail.trim()}</strong>
              </>
            ) : null}
            . The campaign is created as a <strong className="text-foreground">draft</strong> — nothing
            sends to the audience until it&apos;s scheduled in Mailchimp.
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {status && <p className="text-sm text-primary">{status}</p>}
          <Button onClick={createDraft} disabled={busy} size="lg" className="w-full">
            {busy ? "Working…" : "Create Mailchimp draft + send tests"}
          </Button>
        </div>

        <div className="space-y-2">
          <Label>E-shot preview</Label>
          <iframe
            title="E-shot preview"
            sandbox=""
            srcDoc={previewHtml()}
            className="h-[42rem] w-full rounded-xl border border-border bg-white"
          />
        </div>
      </div>
    );
  }

  // ---------- DONE STAGE ----------
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="text-4xl">✓</div>
        <h2 className="text-lg font-semibold">Draft created in Mailchimp</h2>
        {result && result.testedTo.length > 0 ? (
          <p className="max-w-md text-sm text-muted-foreground">
            Test email{result.testedTo.length > 1 ? "s" : ""} sent to{" "}
            <strong className="text-foreground">{result.testedTo.join(" and ")}</strong>. Check the
            inbox, then open the draft in Mailchimp for the final look and scheduling.
          </p>
        ) : (
          <p className="max-w-md text-sm text-amber-500">
            The draft was created, but the test email couldn&apos;t be sent
            {result?.testError ? ` — ${result.testError}` : ""}. You can send a test from inside
            Mailchimp instead.
          </p>
        )}
        <div className="flex flex-wrap justify-center gap-3">
          {result && (
            <a href={result.editUrl} target="_blank" rel="noopener noreferrer">
              <Button size="lg">Open draft in Mailchimp →</Button>
            </a>
          )}
          <Button variant="outline" size="lg" onClick={reset}>
            Build another e-shot
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
