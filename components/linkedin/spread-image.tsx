"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PDFDocumentProxy } from "pdfjs-dist";

// Optional add-on to the LinkedIn generator: drop two magazine-page PDFs and
// get a photo-style "open magazine" image on a flat colour background.
//
// The spread is drawn entirely on canvas from fixed geometry, so the same two
// pages + colour always produce a pixel-identical PNG — unlike a Placeit-style
// manual mockup. Curl, shadows and lighting are simulated by slicing each page
// into vertical strips and offsetting them along a curve, then compositing
// gradient shading clipped to the page silhouette.

type Side = "left" | "right";

type LoadedPdf = {
  fileName: string;
  numPages: number;
  pageNum: number;
};

// Output size: matches the ~4:3 look of the reference mockup and is large
// enough for LinkedIn (which downsizes anyway).
const OUT_W = 2000;
const OUT_H = 1500;
// Height the pages occupy inside the output; pages are rasterised at 2x this
// so text stays crisp after the warp's slight downscale.
const PAGE_H = 1125;
// Default % shaved off every page edge — magazine PDFs carry printers' crop
// marks in the margins and this keeps them out of the image.
const DEFAULT_TRIM = 3.5;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
  return pdfjs;
}

// Page-curl model, per vertical strip. t runs 0 at the outer edge → 1 at the
// spine. The paper dips into the gutter (DIP), bows gently upward mid-page
// (BULGE) and foreshortens slightly as it turns into the spine (SQUEEZE).
const STRIPS = 110;
const DIP = 20;
const BULGE = 7;
const SQUEEZE = 18;

function drawWarpedPage(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  side: Side,
  spineX: number,
  top: number,
  w: number,
  h: number,
  trimFrac: number
) {
  // The trim crops the same % from all four edges of the source page, which
  // preserves its aspect ratio while dropping the crop-mark margin.
  const sx0 = img.width * trimFrac;
  const sy0 = img.height * trimFrac;
  const srcH = img.height * (1 - 2 * trimFrac);
  const srcW = (img.width * (1 - 2 * trimFrac)) / STRIPS;
  const sw = w / STRIPS;
  for (let i = 0; i < STRIPS; i++) {
    const frac = i / (STRIPS - 1);
    const t = side === "left" ? frac : 1 - frac;
    const dy = DIP * Math.pow(t, 2.5) - BULGE * Math.sin(Math.PI * t);
    const sh = h - SQUEEZE * t * t;
    const x = side === "left" ? spineX - w + i * sw : spineX + i * sw;
    // +1.5px overlap hides seams between strips
    ctx.drawImage(
      img,
      sx0 + i * srcW,
      sy0,
      srcW,
      srcH,
      x,
      top + dy + (h - sh) / 2,
      sw + 1.5,
      sh
    );
  }
}

// All shading uses source-atop so gradients only land on the page pixels,
// never on the background — this is what keeps the warped edges clean.
function shadeSpread(
  ctx: CanvasRenderingContext2D,
  spineX: number,
  top: number,
  leftW: number,
  rightW: number,
  h: number
) {
  ctx.globalCompositeOperation = "source-atop";
  const y0 = top - 40;
  const yH = h + 80;

  // gutter shadow, both pages
  let g = ctx.createLinearGradient(spineX - leftW * 0.26, 0, spineX, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = g;
  ctx.fillRect(spineX - leftW, y0, leftW, yH);

  g = ctx.createLinearGradient(spineX + rightW * 0.26, 0, spineX, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = g;
  ctx.fillRect(spineX, y0, rightW, yH);

  // light catch just before the paper turns into the gutter
  g = ctx.createLinearGradient(spineX - 150, 0, spineX - 38, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.09)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(spineX - 150, y0, 112, yH);

  g = ctx.createLinearGradient(spineX + 38, 0, spineX + 150, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.09)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(spineX + 38, y0, 112, yH);

  // faint darkening on the outer edges
  g = ctx.createLinearGradient(spineX - leftW, 0, spineX - leftW + 60, 0);
  g.addColorStop(0, "rgba(0,0,0,0.06)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(spineX - leftW, y0, 60, yH);

  g = ctx.createLinearGradient(spineX + rightW, 0, spineX + rightW - 60, 0);
  g.addColorStop(0, "rgba(0,0,0,0.06)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(spineX + rightW - 60, y0, 60, yH);

  // soft top sheen, as if lit from above
  g = ctx.createLinearGradient(0, top, 0, top + h * 0.4);
  g.addColorStop(0, "rgba(255,255,255,0.05)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(spineX - leftW, y0, leftW + rightW, yH);

  // crease line at the exact spine
  g = ctx.createLinearGradient(spineX - 7, 0, spineX + 7, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.5, "rgba(0,0,0,0.26)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(spineX - 7, y0, 14, yH);

  ctx.globalCompositeOperation = "source-over";
}

const SIDE_LABEL: Record<Side, string> = { left: "Left page", right: "Right page" };

export function SpreadImage({
  magazine,
  brandColor,
}: {
  magazine: string;
  brandColor: string;
}) {
  const [pdfs, setPdfs] = useState<Record<Side, LoadedPdf | null>>({
    left: null,
    right: null,
  });
  const [bg, setBg] = useState(brandColor);
  const [trim, setTrim] = useState(DEFAULT_TRIM);
  const [busy, setBusy] = useState<Side | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragSide, setDragSide] = useState<Side | null>(null);
  // bumped whenever an offscreen page render lands, to retrigger compose
  const [renderTick, setRenderTick] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docsRef = useRef<Record<Side, PDFDocumentProxy | null>>({
    left: null,
    right: null,
  });
  const pagesRef = useRef<Record<Side, HTMLCanvasElement | null>>({
    left: null,
    right: null,
  });
  const inputRefs = {
    left: useRef<HTMLInputElement>(null),
    right: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    const docs = docsRef.current;
    return () => {
      docs.left?.destroy();
      docs.right?.destroy();
    };
  }, []);

  async function renderPage(side: Side, pageNum: number) {
    const doc = docsRef.current[side];
    if (!doc) return;
    const page = await doc.getPage(pageNum);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (PAGE_H * 2) / base.height });
    const c = document.createElement("canvas");
    c.width = Math.ceil(viewport.width);
    c.height = Math.ceil(viewport.height);
    // "print" intent renders in one pass without requestAnimationFrame
    // scheduling, so generation still completes if the tab is backgrounded
    // mid-render.
    await page
      .render({ canvasContext: c.getContext("2d")!, viewport, intent: "print" })
      .promise;
    pagesRef.current[side] = c;
    setRenderTick((n) => n + 1);
  }

  async function handleFile(side: Side, file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please drop a PDF file.");
      return;
    }
    setError(null);
    setBusy(side);
    try {
      const pdfjs = await loadPdfjs();
      const data = new Uint8Array(await file.arrayBuffer());
      const doc = await pdfjs.getDocument({ data }).promise;
      docsRef.current[side]?.destroy();
      docsRef.current[side] = doc;
      setPdfs((p) => ({
        ...p,
        [side]: { fileName: file.name, numPages: doc.numPages, pageNum: 1 },
      }));
      await renderPage(side, 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that PDF.");
    } finally {
      setBusy(null);
      const input = inputRefs[side].current;
      if (input) input.value = "";
    }
  }

  async function changePage(side: Side, raw: number) {
    const pdf = pdfs[side];
    if (!pdf) return;
    const pageNum = Math.min(Math.max(1, raw || 1), pdf.numPages);
    setPdfs((p) => ({ ...p, [side]: { ...pdf, pageNum } }));
    setBusy(side);
    try {
      await renderPage(side, pageNum);
    } finally {
      setBusy(null);
    }
  }

  const ready = Boolean(pdfs.left && pdfs.right);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const l = pagesRef.current.left;
    const r = pagesRef.current.right;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, OUT_W, OUT_H);
    if (!l || !r) return;

    const trimFrac = Math.min(Math.max(trim, 0), 15) / 100;
    const top = (OUT_H - PAGE_H) / 2 - 10;
    const spineX = OUT_W / 2;
    const leftW = Math.min(860, PAGE_H * (l.width / l.height));
    const rightW = Math.min(860, PAGE_H * (r.width / r.height));

    // pages + shading on a transparent layer, so shading can clip to them
    const spread = document.createElement("canvas");
    spread.width = OUT_W;
    spread.height = OUT_H;
    const sctx = spread.getContext("2d")!;
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    drawWarpedPage(sctx, l, "left", spineX, top, leftW, PAGE_H, trimFrac);
    drawWarpedPage(sctx, r, "right", spineX, top, rightW, PAGE_H, trimFrac);
    shadeSpread(sctx, spineX, top, leftW, rightW, PAGE_H);

    // drop shadow cast from the exact page silhouette
    const sil = document.createElement("canvas");
    sil.width = OUT_W;
    sil.height = OUT_H;
    const silCtx = sil.getContext("2d")!;
    silCtx.drawImage(spread, 0, 0);
    silCtx.globalCompositeOperation = "source-in";
    silCtx.fillStyle = "rgba(10,12,16,0.42)";
    silCtx.fillRect(0, 0, OUT_W, OUT_H);
    ctx.save();
    ctx.filter = "blur(32px)";
    ctx.drawImage(sil, 7, 26);
    ctx.restore();

    ctx.drawImage(spread, 0, 0);
  }, [bg, trim, renderTick, pdfs]);

  function download() {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${magazine}-spread.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  const swatches = [brandColor, "#175d68", "#0f172a", "#e2e8f0"];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {(["left", "right"] as const).map((side) => {
            const pdf = pdfs[side];
            return (
              <div key={side} className="space-y-2">
                <div
                  onClick={() => busy !== side && inputRefs[side].current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragSide(side);
                  }}
                  onDragLeave={() => setDragSide(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragSide(null);
                    const file = e.dataTransfer.files?.[0];
                    if (file && busy !== side) handleFile(side, file);
                  }}
                  className={`flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                    dragSide === side
                      ? "border-primary bg-primary/5"
                      : "border-input hover:border-muted-foreground/50"
                  } ${busy === side ? "pointer-events-none opacity-60" : ""}`}
                >
                  <input
                    ref={inputRefs[side]}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] && handleFile(side, e.target.files[0])
                    }
                  />
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {SIDE_LABEL[side]}
                  </p>
                  <p className="mt-1 max-w-full truncate text-sm font-medium">
                    {busy === side ? "Rendering…" : pdf ? pdf.fileName : "Drop PDF"}
                  </p>
                </div>
                {pdf && pdf.numPages > 1 && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Page
                    <input
                      type="number"
                      min={1}
                      max={pdf.numPages}
                      value={pdf.pageNum}
                      onChange={(e) => changePage(side, Number(e.target.value))}
                      className="h-7 w-16 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
                    />
                    of {pdf.numPages}
                  </label>
                )}
              </div>
            );
          })}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Page edge trim</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={15}
              step={0.5}
              value={trim}
              onChange={(e) => setTrim(Number(e.target.value))}
              className="h-8 w-20 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
            />
            <span className="text-xs text-muted-foreground">
              % cropped from each page edge — hides printers&apos; crop marks. Nudge up if
              marks still show, down if content is cut off.
            </span>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Background colour</label>
          <div className="flex items-center gap-2">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Background ${c}`}
                onClick={() => setBg(c)}
                className={`h-8 w-8 rounded-full border transition-transform ${
                  bg.toLowerCase() === c.toLowerCase()
                    ? "scale-110 ring-2 ring-ring ring-offset-2"
                    : "hover:scale-105"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={bg}
              onChange={(e) => setBg(e.target.value)}
              aria-label="Custom background colour"
              className="h-8 w-10 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
            />
            <span className="text-xs text-muted-foreground">{bg}</span>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Spread image</label>
          {ready && (
            <Button size="sm" variant="outline" onClick={download}>
              Download PNG
            </Button>
          )}
        </div>
        <div className="relative overflow-hidden rounded-xl border">
          <canvas
            ref={canvasRef}
            width={OUT_W}
            height={OUT_H}
            className="block h-auto w-full"
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/90 p-8 text-center text-sm text-muted-foreground">
              Add both page PDFs to generate the image.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
