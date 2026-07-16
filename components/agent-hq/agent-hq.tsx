"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestScanForTitle } from "@/lib/actions/sources";
import { Spy, type SpyState } from "@/components/agent-hq/spy";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

type SourceStatus = {
  id: string;
  name: string;
  type: string;
  url: string;
  active: boolean;
  scanStatus: "IDLE" | "QUEUED" | "SCANNING";
  lastCheckedAt: string | null;
  lastResult: string | null;
};

type Title = {
  name: string;
  hostname: string;
  sources: SourceStatus[];
  busy: boolean;
};

function groupByTitle(sources: SourceStatus[]): Title[] {
  const map = new Map<string, SourceStatus[]>();
  for (const s of sources) {
    if (!s.active) continue;
    map.set(s.name, [...(map.get(s.name) ?? []), s]);
  }
  return [...map.entries()].map(([name, group]) => {
    const website = group.find((g) => g.type === "WEBSITE") ?? group[0];
    return {
      name,
      hostname: new URL(website.url).hostname,
      sources: group,
      busy: group.some((g) => g.scanStatus !== "IDLE"),
    };
  });
}

export function AgentHQ({
  magazine,
  initialSources,
}: {
  magazine: string;
  initialSources: SourceStatus[];
}) {
  const [sources, setSources] = useState(initialSources);
  const [report, setReport] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverTile, setHoverTile] = useState<string | null>(null);

  const arenaRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const prevBusy = useRef(new Set<string>());
  const [spyOffset, setSpyOffset] = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);

  const titles = useMemo(() => groupByTitle(sources), [sources]);
  const activeTitle = titles.find((t) => t.sources.some((s) => s.scanStatus === "SCANNING"))
    ?? titles.find((t) => t.busy);

  // Poll live status — fast while the spy is on a mission, relaxed when asleep
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/agent-status?magazine=${encodeURIComponent(magazine)}`);
        if (res.ok && !stop) {
          const data = await res.json();
          setSources(data.sources);
        }
      } catch {}
    }
    const anyBusy = sources.some((s) => s.scanStatus !== "IDLE");
    const interval = setInterval(tick, anyBusy ? 3500 : 15000);
    return () => {
      stop = true;
      clearInterval(interval);
    };
  }, [sources, magazine]);

  // When a title finishes scanning, have the spy report what he found
  useEffect(() => {
    const busyNow = new Set(
      titles.filter((t) => t.busy).map((t) => t.name)
    );
    for (const name of prevBusy.current) {
      if (!busyNow.has(name)) {
        const title = titles.find((t) => t.name === name);
        const result = title?.sources
          .map((s) => s.lastResult)
          .filter((r) => r && !r.startsWith("Scan queued"))
          .join(" · ");
        if (result) setReport(`${name}: ${result}`);
        setTimeout(() => setReport(null), 8000);
      }
    }
    prevBusy.current = busyNow;
  }, [titles]);

  // Walk the spy to the tile being scanned, or home when idle
  useEffect(() => {
    const arena = arenaRef.current;
    const home = homeRef.current;
    if (!arena || !home) return;
    const arenaBox = arena.getBoundingClientRect();
    let target = { x: 0, y: 0 };
    if (activeTitle) {
      const tile = tileRefs.current.get(activeTitle.name);
      if (tile) {
        const box = tile.getBoundingClientRect();
        target = {
          x: box.left - arenaBox.left + box.width / 2 - 44,
          y: box.top - arenaBox.top - 78,
        };
      }
    } else {
      const box = home.getBoundingClientRect();
      target = { x: box.left - arenaBox.left, y: box.top - arenaBox.top };
    }
    setMoving(true);
    setSpyOffset(target);
    const t = setTimeout(() => setMoving(false), 1400);
    return () => clearTimeout(t);
  }, [activeTitle?.name]);

  const spyState: SpyState = dragPos
    ? "walking"
    : moving
      ? "walking"
      : report
        ? "reporting"
        : activeTitle
          ? "investigating"
          : "sleeping";

  // Pointer-based drag: pick the spy up, drop him on a tile to launch a scan.
  // Window-level listeners + pointer-events:none on the spy while dragging,
  // so elementFromPoint sees the tile underneath rather than the spy himself.
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragPos({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!dragPos) return;

    function onMove(e: PointerEvent) {
      setDragPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tile = el?.closest?.("[data-hq-tile]") as HTMLElement | null;
      setHoverTile(tile?.dataset.hqTile ?? null);
    }

    async function onUp(e: PointerEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tile = el?.closest?.("[data-hq-tile]") as HTMLElement | null;
      setDragPos(null);
      setHoverTile(null);
      if (tile?.dataset.hqTile) {
        const name = tile.dataset.hqTile;
        setSources((prev) =>
          prev.map((s) => (s.name === name ? { ...s, scanStatus: "QUEUED" } : s))
        );
        await requestScanForTitle(magazine, name);
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragPos !== null]);

  const nextMonday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return format(d, "EEE d MMM");
  }, []);

  return (
    <div ref={arenaRef} className="hq-arena relative rounded-2xl border bg-card/50 p-6">
      <div className="mb-5 flex items-start justify-between">
        <div className="flex items-end gap-4">
          <div ref={homeRef} style={{ width: 88, height: 119 }} />
          <div className="pb-2">
            <div className="text-sm font-semibold">Agent Intel</div>
            <div className="text-xs text-muted-foreground">
              {spyState === "sleeping" && `Sleeping — next patrol ${nextMonday}, 06:00`}
              {spyState === "walking" && "On the move…"}
              {spyState === "investigating" && activeTitle && `Investigating ${activeTitle.name}…`}
              {spyState === "reporting" && "Reporting back"}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {activeTitle ? "On a mission" : "Off duty"}
        </Badge>
      </div>

      {/* the spy — absolutely positioned so he can walk between tiles */}
      <div
        className="spy-grab absolute z-10"
        style={
          dragPos
            ? {
                position: "fixed",
                left: dragPos.x - 44,
                top: dragPos.y - 60,
                transition: "none",
                zIndex: 50,
                pointerEvents: "none",
              }
            : {
                left: 24,
                top: 24,
                transform: `translate(${spyOffset.x}px, ${spyOffset.y}px)`,
                transition: "transform 1.4s ease-in-out",
              }
        }
        onPointerDown={onPointerDown}
        title="Drag me onto a title to scan it now"
      >
        <Spy state={spyState} />
      </div>

      {/* speech bubble when reporting */}
      {report && (
        <div className="absolute left-28 top-3 z-20 max-w-sm rounded-xl border border-primary/40 bg-popover px-3 py-2 text-xs shadow-sm">
          {report}
        </div>
      )}

      <div
        className="grid gap-2.5 pt-16"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))" }}
      >
        {titles.map((t) => (
          <div
            key={t.name}
            data-hq-tile={t.name}
            ref={(el) => {
              if (el) tileRefs.current.set(t.name, el);
            }}
            className={`flex min-w-0 flex-col items-center gap-1.5 rounded-xl border bg-card p-2.5 text-center transition-colors ${
              t.busy ? "hq-tile--scanning" : ""
            } ${hoverTile === t.name ? "border-primary bg-primary/10" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://www.google.com/s2/favicons?domain=${t.hostname}&sz=64`}
              alt=""
              width={24}
              height={24}
              className="rounded"
            />
            <div className="w-full break-words text-[11px] font-medium leading-tight">{t.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {t.busy
                ? t.sources.some((s) => s.scanStatus === "SCANNING")
                  ? "Being investigated…"
                  : "Mission queued…"
                : t.sources[0].lastCheckedAt
                  ? `Checked ${format(new Date(t.sources[0].lastCheckedAt), "d MMM")}`
                  : "Not yet visited"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
