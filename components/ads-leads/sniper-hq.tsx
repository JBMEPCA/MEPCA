"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestSearchForTerm } from "@/lib/actions/ads-leads";
import { Sniper, type SniperState } from "@/components/ads-leads/sniper";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

type TermStatus = {
  id: string;
  term: string;
  category: string | null;
  active: boolean;
  searchStatus: "IDLE" | "QUEUED" | "SEARCHING";
  lastCheckedAt: string | null;
  lastResult: string | null;
};

type Shot = { company: string; term: string };

// The Google-Ads phone mockup the sniper is aiming at. Instead of the stock
// "Your Company Here" / "Your Service Near Me" it shows a real caught advertiser
// and the term we're monitoring — cycling as the sniper "picks them off".
function AdPhone({ shot }: { shot: Shot }) {
  return (
    <div className="ads-phone">
      <div className="ads-phone-notch" />
      <div className="ads-phone-screen">
        <div className="ads-phone-googlebar">
          <span className="ads-g ads-g1">G</span>
          <span className="ads-g ads-g2">o</span>
          <span className="ads-g ads-g3">o</span>
          <span className="ads-g ads-g1">g</span>
          <span className="ads-g ads-g4">l</span>
          <span className="ads-g ads-g2">e</span>
        </div>
        {/* search box — shows the monitored term */}
        <div className="ads-searchbox">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="#9aa0a6" strokeWidth="2" />
            <path d="M16 16 L21 21" stroke="#9aa0a6" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="ads-search-term" key={shot.term}>{shot.term}</span>
        </div>
        {/* the paid ad card — shows the caught company */}
        <div className="ads-card" key={shot.company}>
          <div className="ads-card-top">
            <span className="ads-badge">Ad</span>
            <span className="ads-company">{shot.company}</span>
          </div>
          <div className="ads-rating">
            4.9 <span className="ads-stars">★★★★★</span> (49) · 0.5 mi
          </div>
          <div className="ads-copy">Great competitive services · affordability · trust · fully insured…</div>
          <div className="ads-call">📞 Call now</div>
        </div>
      </div>
    </div>
  );
}

export function SniperHQ({
  magazine,
  initialTerms,
  recentLeads,
}: {
  magazine: string;
  initialTerms: TermStatus[];
  recentLeads: Shot[];
}) {
  const [terms, setTerms] = useState(initialTerms);
  const [report, setReport] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [hoverTile, setHoverTile] = useState<string | null>(null);

  const arenaRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef(new Map<string, HTMLDivElement>());
  const prevBusy = useRef(new Set<string>());
  const [sniperOffset, setSniperOffset] = useState({ x: 0, y: 0 });
  const [moving, setMoving] = useState(false);

  const activeTerms = useMemo(() => terms.filter((t) => t.active), [terms]);
  const activeTerm =
    terms.find((t) => t.searchStatus === "SEARCHING") ??
    terms.find((t) => t.searchStatus !== "IDLE");

  // What the phone shows: real caught advertisers if we have them, otherwise a
  // placeholder per monitored term so the mockup still demos the idea.
  const shots: Shot[] = useMemo(() => {
    if (recentLeads.length > 0) return recentLeads;
    if (activeTerms.length > 0) {
      return activeTerms.map((t) => ({ company: "Your Company Here", term: t.term }));
    }
    return [{ company: "Your Company Here", term: "your search term" }];
  }, [recentLeads, activeTerms]);

  const [shotIndex, setShotIndex] = useState(0);
  const [firing, setFiring] = useState(false);

  // Cycle the phone through shots; each swap is a "shot" (muzzle flash).
  useEffect(() => {
    const cycle = setInterval(() => {
      setFiring(true);
      setShotIndex((i) => (i + 1) % shots.length);
      const off = setTimeout(() => setFiring(false), 380);
      return () => clearTimeout(off);
    }, 2600);
    return () => clearInterval(cycle);
  }, [shots.length]);

  const shot = shots[shotIndex % shots.length];

  // Poll live status — fast while a search is running, relaxed when idle
  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/ads-agent-status?magazine=${encodeURIComponent(magazine)}`);
        if (res.ok && !stop) {
          const data = await res.json();
          setTerms(data.terms);
        }
      } catch {}
    }
    const anyBusy = terms.some((t) => t.searchStatus !== "IDLE");
    const interval = setInterval(tick, anyBusy ? 3500 : 15000);
    return () => {
      stop = true;
      clearInterval(interval);
    };
  }, [terms, magazine]);

  // When a term finishes, have the sniper report what he bagged
  useEffect(() => {
    const busyNow = new Set(
      terms.filter((t) => t.searchStatus !== "IDLE").map((t) => t.id)
    );
    for (const id of prevBusy.current) {
      if (!busyNow.has(id)) {
        const t = terms.find((x) => x.id === id);
        if (t?.lastResult && !t.lastResult.startsWith("Search queued")) {
          setReport(`${t.term}: ${t.lastResult}`);
          setTimeout(() => setReport(null), 8000);
        }
      }
    }
    prevBusy.current = busyNow;
  }, [terms]);

  // Walk the sniper to the term being searched, or home (aiming at the phone) when idle
  useEffect(() => {
    const arena = arenaRef.current;
    const home = homeRef.current;
    if (!arena || !home) return;
    const arenaBox = arena.getBoundingClientRect();
    let target = { x: 0, y: 0 };
    if (activeTerm) {
      const tile = tileRefs.current.get(activeTerm.id);
      if (tile) {
        const box = tile.getBoundingClientRect();
        target = {
          x: box.left - arenaBox.left + box.width / 2 - 90,
          y: box.top - arenaBox.top - 96,
        };
      }
    }
    setMoving(true);
    setSniperOffset(target);
    const t = setTimeout(() => setMoving(false), 1400);
    return () => clearTimeout(t);
  }, [activeTerm?.id]);

  const sniperState: SniperState =
    dragPos || moving ? "walking" : firing ? "firing" : "aiming";

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragPos({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!dragPos) return;

    function onMove(e: PointerEvent) {
      setDragPos({ x: e.clientX, y: e.clientY });
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tile = el?.closest?.("[data-hq-term]") as HTMLElement | null;
      setHoverTile(tile?.dataset.hqTerm ?? null);
    }

    async function onUp(e: PointerEvent) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tile = el?.closest?.("[data-hq-term]") as HTMLElement | null;
      setDragPos(null);
      setHoverTile(null);
      if (tile?.dataset.hqTerm) {
        const id = tile.dataset.hqTerm;
        setTerms((prev) =>
          prev.map((t) => (t.id === id ? { ...t, searchStatus: "QUEUED" } : t))
        );
        await requestSearchForTerm(id);
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
    <div ref={arenaRef} className="hq-arena sniper-arena relative rounded-2xl border bg-card/50 p-6">
      <div className="mb-2 flex items-start justify-between">
        <div className="flex items-end gap-4">
          {/* the sniper's home slot — he sits here aiming at the phone */}
          <div ref={homeRef} style={{ width: 180, height: 120 }} />
          <div className="pb-2">
            <div className="text-sm font-semibold">Sniper</div>
            <div className="text-xs text-muted-foreground">
              {activeTerm
                ? `Taking aim at "${activeTerm.term}"…`
                : dragPos || moving
                  ? "On the move…"
                  : `Sleeping — next sweep ${nextMonday}, 06:30`}
            </div>
          </div>
        </div>
        <Badge variant="outline" className="text-xs">
          {activeTerm ? "On a mission" : "Off duty"}
        </Badge>
      </div>

      {/* the phone mockup he's aiming at, top-right of the hero */}
      <div className="pointer-events-none absolute right-8 top-6 z-0">
        <AdPhone shot={shot} />
      </div>

      {/* the sniper — absolutely positioned so he can walk to term tiles */}
      <div
        className="sniper-grab absolute z-10"
        style={
          dragPos
            ? {
                position: "fixed",
                left: dragPos.x - 54,
                top: dragPos.y - 54,
                transition: "none",
                zIndex: 50,
                pointerEvents: "none",
              }
            : {
                left: 24,
                top: 18,
                transform: `translate(${sniperOffset.x}px, ${sniperOffset.y}px)`,
                transition: "transform 1.4s ease-in-out",
              }
        }
        onPointerDown={onPointerDown}
        title="Drag me onto a term to search it now"
      >
        <Sniper state={sniperState} />
      </div>

      {/* speech bubble when reporting */}
      {report && (
        <div className="absolute left-44 top-2 z-20 max-w-sm rounded-xl border border-primary/40 bg-popover px-3 py-2 text-xs shadow-sm">
          {report}
        </div>
      )}

      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", paddingTop: 248 }}
      >
        {activeTerms.map((t) => (
          <div
            key={t.id}
            data-hq-term={t.id}
            ref={(el) => {
              if (el) tileRefs.current.set(t.id, el);
            }}
            className={`flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-2.5 transition-colors ${
              t.searchStatus !== "IDLE" ? "hq-tile--scanning" : ""
            } ${hoverTile === t.id ? "border-primary bg-primary/10" : ""}`}
          >
            <div className="w-full break-words text-[12px] font-medium leading-tight">{t.term}</div>
            <div className="text-[10px] text-muted-foreground">
              {t.searchStatus !== "IDLE"
                ? t.searchStatus === "SEARCHING"
                  ? "In the crosshairs…"
                  : "Locked and loaded…"
                : t.lastCheckedAt
                  ? `Swept ${format(new Date(t.lastCheckedAt), "d MMM")}`
                  : "Not yet swept"}
            </div>
          </div>
        ))}
        {activeTerms.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground">
            No terms yet — add one, or seed them from your WordPress categories, and the
            Sniper will start hunting.
          </div>
        )}
      </div>
    </div>
  );
}
