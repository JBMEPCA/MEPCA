"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";

type Mode = "article" | "issue";

// pdfjs is loaded lazily on first use so it never runs on the server and only
// costs the download when JB actually drops a PDF.
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
    const line = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    parts.push(line);
  }
  await doc.destroy();
  return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

const DEFAULT_LINK = "https://lnkd.in/evCWdukN";

export function LinkedInGenerator() {
  const [mode, setMode] = useState<Mode>("article");
  const [issueLink, setIssueLink] = useState(DEFAULT_LINK);
  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState("");
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setStatus("Please drop a PDF file.");
      return;
    }
    setBusy(true);
    setPost("");
    setCopied(false);
    setFileName(file.name);
    try {
      setStatus("Reading the PDF…");
      const text = await extractPdfText(file);
      if (text.length < 200) {
        setStatus(
          "Couldn't read text from that PDF — it may be a scanned image. Try the digital-issue PDF instead."
        );
        return;
      }
      setStatus(mode === "issue" ? "Writing the issue round-up…" : "Writing the post…");
      const res = await fetch("/api/linkedin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, text, issueLink }),
      });
      const data = (await res.json()) as { post?: string; error?: string };
      if (!res.ok || !data.post) {
        setStatus(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setPost(data.post);
      setStatus(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Something went wrong reading the PDF.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function copyPost() {
    await navigator.clipboard.writeText(post);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="article">Single article</TabsTrigger>
            <TabsTrigger value="issue">Whole issue</TabsTrigger>
          </TabsList>
        </Tabs>

        <p className="text-sm text-muted-foreground">
          {mode === "article"
            ? "Drop a single article PDF — you'll get a short post with 3 hashtags, ready to paste."
            : "Drop the whole issue PDF — you'll get the monthly round-up post in the usual format."}
        </p>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Digital issue link</label>
          <input
            type="url"
            value={issueLink}
            onChange={(e) => setIssueLink(e.target.value)}
            placeholder="https://lnkd.in/…"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            The "read more" link dropped into the post. Update it for each new issue.
          </p>
        </div>

        <div
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file && !busy) handleFile(file);
          }}
          className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? "border-primary bg-primary/5" : "border-input hover:border-muted-foreground/50"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          <p className="text-sm font-medium">
            {fileName ?? "Drag an article PDF here"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">or click to choose a file</p>
        </div>

        {status && (
          <p className={`text-sm ${busy ? "text-primary" : "text-muted-foreground"}`}>{status}</p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Your LinkedIn post</label>
          {post && (
            <Button size="sm" variant="outline" onClick={copyPost}>
              {copied ? "Copied ✓" : "Copy post"}
            </Button>
          )}
        </div>
        {post ? (
          <Textarea
            value={post}
            onChange={(e) => setPost(e.target.value)}
            className="min-h-[28rem] font-sans whitespace-pre-wrap"
          />
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex min-h-[28rem] items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {busy
                ? "Working on it…"
                : "Your ready-made post will appear here. You can edit it before copying."}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
