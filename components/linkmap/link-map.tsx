"use client";

// The 3D Internal Linking Map. Every dot is a page on the magazine's website,
// every line an in-content link between two pages. Drag to rotate, scroll to
// zoom, hover a dot for the page details, click it to open the page.
//
// Rendering is 3d-force-graph (Three.js/WebGL) — loaded dynamically because
// it needs the browser and would sink server rendering.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search } from "lucide-react";
import { requestLinkMapCrawl } from "@/lib/actions/linkmap";
import type { ForceGraph3DInstance } from "3d-force-graph";

type GNode = {
  id: string;
  url: string;
  path: string;
  title: string | null;
  kind: string;
  httpStatus: number | null;
  inCount: number;
  outCount: number;
  // set by the physics engine once the graph is live
  x?: number;
  y?: number;
  z?: number;
};

export type CrawlInfo = {
  id: string;
  status: "QUEUED" | "RUNNING" | "DONE" | "ERROR";
  totalPages: number;
  crawledPages: number;
  error: string | null;
  finishedAt: string | null;
} | null;

const COLORS = {
  home: "#ffffff",
  page: "#f5a623",
  post: "#2ab6bd",
  company: "#a78bfa",
  broken: "#ef4444",
  highlight: "#fde047",
};

export function LinkMap({
  magazineId,
  brandColor,
  initialCrawl,
}: {
  magazineId: string;
  brandColor: string;
  initialCrawl: CrawlInfo;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraph3DInstance | null>(null);
  const nodesRef = useRef<GNode[]>([]);
  const highlightRef = useRef<Set<string>>(new Set());
  const [crawl, setCrawl] = useState<CrawlInfo>(initialCrawl);
  const [stats, setStats] = useState<{ pages: number; links: number; orphans: number } | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [hasData, setHasData] = useState<boolean | null>(null); // null = loading

  const postColor = brandColor || COLORS.post;

  const nodeColor = useCallback(
    (node: object) => {
      const n = node as GNode;
      if (highlightRef.current.has(n.id)) return COLORS.highlight;
      if (n.path === "/") return COLORS.home;
      if (n.httpStatus !== null && (n.httpStatus === 0 || n.httpStatus >= 400))
        return COLORS.broken;
      if (n.kind === "company") return COLORS.company;
      return n.kind === "page" ? COLORS.page : postColor;
    },
    [postColor]
  );

  const loadGraph = useCallback(async () => {
    const res = await fetch(`/api/linkmap?magazine=${magazineId}`);
    if (!res.ok) return;
    const data: {
      pages: Omit<GNode, "inCount" | "outCount">[];
      links: { fromId: string; toId: string }[];
    } = await res.json();

    if (data.pages.length === 0) {
      setHasData(false);
      return;
    }

    const inCount = new Map<string, number>();
    const outCount = new Map<string, number>();
    for (const l of data.links) {
      inCount.set(l.toId, (inCount.get(l.toId) ?? 0) + 1);
      outCount.set(l.fromId, (outCount.get(l.fromId) ?? 0) + 1);
    }
    const nodes: GNode[] = data.pages.map((p) => ({
      ...p,
      inCount: inCount.get(p.id) ?? 0,
      outCount: outCount.get(p.id) ?? 0,
    }));
    nodesRef.current = nodes;
    setStats({
      pages: nodes.length,
      links: data.links.length,
      orphans: nodes.filter((n) => n.inCount === 0 && n.outCount === 0).length,
    });
    setHasData(true);

    graphRef.current?.graphData({
      nodes,
      links: data.links.map((l) => ({ source: l.fromId, target: l.toId })),
    });
  }, [magazineId]);

  // Build the graph once the component is on screen
  useEffect(() => {
    let disposed = false;
    (async () => {
      const { default: ForceGraph3D } = await import("3d-force-graph");
      if (disposed || !containerRef.current) return;

      const graph = new ForceGraph3D(containerRef.current, { controlType: "orbit" })
        .width(containerRef.current.clientWidth)
        .height(containerRef.current.clientHeight)
        .backgroundColor("#04040c")
        .showNavInfo(false)
        .nodeColor(nodeColor)
        .nodeVal((node: object) => 1 + (node as GNode).inCount * 1.5)
        .nodeOpacity(0.92)
        .nodeLabel((node: object) => {
          const n = node as GNode;
          const title = n.title ?? n.path;
          return `<div style="background:rgba(10,10,20,.92);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:8px 10px;max-width:320px;font-size:12px;color:#fff">
            <div style="font-weight:600;margin-bottom:2px">${escapeHtml(title)}</div>
            <div style="color:#9ca3af;word-break:break-all">${escapeHtml(n.path)}</div>
            <div style="margin-top:4px;color:#d1d5db">${n.inCount} link${n.inCount === 1 ? "" : "s"} in &middot; ${n.outCount} out${n.httpStatus && n.httpStatus >= 400 ? ` &middot; <span style=\"color:#ef4444\">HTTP ${n.httpStatus}</span>` : ""}</div>
            <div style="margin-top:4px;color:#6b7280">Click to open the page</div>
          </div>`;
        })
        .linkColor(() => "#ffffff")
        .linkOpacity(0.18)
        .onNodeClick((node: object) => {
          window.open((node as GNode).url, "_blank", "noopener");
        });

      graphRef.current = graph;
      await loadGraph();
    })();

    const ro = new ResizeObserver(() => {
      if (graphRef.current && containerRef.current) {
        graphRef.current
          .width(containerRef.current.clientWidth)
          .height(containerRef.current.clientHeight);
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      disposed = true;
      ro.disconnect();
      graphRef.current?._destructor();
      graphRef.current = null;
    };
  }, [loadGraph, nodeColor]);

  // While a crawl is running, follow its progress and reload the map when done
  const crawlActive = crawl?.status === "QUEUED" || crawl?.status === "RUNNING";
  useEffect(() => {
    if (!crawlActive) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/linkmap/status?magazine=${magazineId}`);
      if (!res.ok) return;
      const latest: CrawlInfo = await res.json();
      setCrawl(latest);
      if (latest?.status === "DONE") void loadGraph();
    }, 3000);
    return () => clearInterval(timer);
  }, [crawlActive, magazineId, loadGraph]);

  const startCrawl = async () => {
    await requestLinkMapCrawl(magazineId);
    const res = await fetch(`/api/linkmap/status?magazine=${magazineId}`);
    if (res.ok) setCrawl(await res.json());
  };

  const runSearch = () => {
    const q = search.trim().toLowerCase();
    highlightRef.current = new Set();
    setSearchMsg(null);
    if (q) {
      const matches = nodesRef.current.filter(
        (n) => n.path.toLowerCase().includes(q) || (n.title ?? "").toLowerCase().includes(q)
      );
      if (matches.length === 0) {
        setSearchMsg("No pages match");
      } else {
        highlightRef.current = new Set(matches.map((m) => m.id));
        setSearchMsg(`${matches.length} page${matches.length === 1 ? "" : "s"} highlighted`);
        const target = matches[0];
        const graph = graphRef.current;
        if (graph && target.x !== undefined && target.y !== undefined && target.z !== undefined) {
          const dist = Math.hypot(target.x, target.y, target.z) || 1;
          const ratio = 1 + 160 / dist;
          graph.cameraPosition(
            { x: target.x * ratio, y: target.y * ratio, z: target.z * ratio },
            { x: target.x, y: target.y, z: target.z },
            1200
          );
        }
      }
    }
    // re-applying the accessor makes the graph repaint with the new highlights
    graphRef.current?.nodeColor(nodeColor);
  };

  const progressPct =
    crawl && crawl.totalPages > 0
      ? Math.round((crawl.crawledPages / crawl.totalPages) * 100)
      : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={startCrawl} disabled={crawlActive} size="sm">
          <RefreshCw className={`mr-1.5 h-4 w-4 ${crawlActive ? "animate-spin" : ""}`} />
          {crawlActive ? "Crawling…" : hasData ? "Update map" : "Build the map"}
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runSearch();
          }}
          className="flex items-center gap-2"
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a page…"
              className="h-9 w-56 pl-8"
            />
          </div>
        </form>
        {searchMsg && <span className="text-xs text-muted-foreground">{searchMsg}</span>}
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {stats && (
            <>
              <span>
                <b className="text-foreground">{stats.pages.toLocaleString()}</b> pages
              </span>
              <span>
                <b className="text-foreground">{stats.links.toLocaleString()}</b> links
              </span>
              <span>
                <b className="text-foreground">{stats.orphans.toLocaleString()}</b> orphans
              </span>
            </>
          )}
          {crawl?.finishedAt && !crawlActive && (
            <span>updated {new Date(crawl.finishedAt).toLocaleDateString("en-GB")}</span>
          )}
        </div>
      </div>

      {crawlActive && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700"
              style={{ width: `${Math.max(progressPct, 2)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {crawl!.totalPages === 0
              ? "Reading the site's sitemaps…"
              : `Crawled ${crawl!.crawledPages.toLocaleString()} of ${crawl!.totalPages.toLocaleString()} pages (${progressPct}%) — you can leave this page and come back`}
          </p>
        </div>
      )}
      {crawl?.status === "ERROR" && (
        <p className="text-xs text-red-500">
          Last crawl failed{crawl.error ? `: ${crawl.error}` : ""} — try Update map again.
        </p>
      )}

      <div className="relative h-[calc(100vh-16rem)] min-h-[480px] overflow-hidden rounded-xl border bg-[#04040c]">
        <div ref={containerRef} className="absolute inset-0" />
        {hasData === false && !crawlActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
            <p className="max-w-sm text-sm text-gray-300">
              No map yet. Click <b>Build the map</b> to crawl the website — it takes around half
              an hour for the full site, and the map appears here when it&apos;s done.
            </p>
          </div>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-lg bg-black/60 px-3 py-2 text-[11px] text-gray-200">
          <LegendDot color={COLORS.home} label="Homepage" />
          <LegendDot color={COLORS.page} label="Pages" />
          <LegendDot color={postColor} label="Articles" />
          <LegendDot color={COLORS.company} label="Company profiles" />
          <LegendDot color={COLORS.broken} label="Broken (4xx/5xx)" />
          <span className="text-gray-400">Bigger dot = more links pointing at it</span>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
