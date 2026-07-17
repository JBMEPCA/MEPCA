import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrafficChart } from "@/components/analytics/traffic-chart";
import {
  trafficOverview, dailySessions, topPages, trafficChannels, searchOverview, topQueries,
  hasAnalyticsConfig,
} from "@/lib/analytics";
import { notFound } from "next/navigation";
import { getMagazine } from "@/lib/magazines";
import { NotSetUpYet } from "@/components/not-set-up-yet";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (n: number) => n.toLocaleString("en-GB");

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (!previous) return <span className="text-xs text-muted-foreground">new</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const good = invert ? pct <= 0 : pct >= 0;
  return (
    <span className={`text-xs ${good ? "text-green-400" : "text-red-400"}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% vs prev 28 days
    </span>
  );
}

function fmtDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ magazine: string }>;
}) {
  const { magazine } = await params;
  const mag = getMagazine(magazine);
  if (!mag) notFound();

  // Switches on per title once its GA4 property ID + Search Console site are
  // in the environment (GA4_PROPERTY_ID_<SUFFIX> / GSC_SITE_URL_<SUFFIX>).
  if (!hasAnalyticsConfig(mag.slug)) {
    return (
      <NotSetUpYet
        title={`${mag.shortName} Analytics`}
        what={`Google Analytics and Search Console for ${mag.name}`}
        need="access to the site's Google Analytics property and Search Console"
      />
    );
  }

  let data;
  try {
    const [overview, daily, pages, channels, search, queries] = await Promise.all([
      trafficOverview(mag.slug),
      dailySessions(mag.slug, 90),
      topPages(mag.slug, 10),
      trafficChannels(mag.slug),
      searchOverview(mag.slug),
      topQueries(mag.slug, 10),
    ]);
    data = { overview, daily, pages, channels, search, queries };
  } catch (e) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t reach Google Analytics — check the Google credentials are configured.
        </p>
        <p className="text-xs text-muted-foreground">{e instanceof Error ? e.message : ""}</p>
      </div>
    );
  }

  const { overview, daily, pages, channels, search, queries } = data;
  const maxChannel = Math.max(...channels.map((c) => c.sessions), 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{mag.shortName} Analytics</h1>
        <p className="text-sm text-muted-foreground">
          {mag.siteUrl.replace(/^https?:\/\//, "")} — last 28 days vs the 28 before, live from Google.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <div className="text-xs uppercase tracking-widest text-primary/80">Sessions</div>
          <div className="mt-1 text-3xl font-bold text-primary">{num(overview.current.sessions)}</div>
          <Delta current={overview.current.sessions} previous={overview.previous.sessions} />
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Visitors</div>
          <div className="mt-1 text-3xl font-bold">{num(overview.current.users)}</div>
          <Delta current={overview.current.users} previous={overview.previous.users} />
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Pageviews</div>
          <div className="mt-1 text-3xl font-bold">{num(overview.current.pageviews)}</div>
          <Delta current={overview.current.pageviews} previous={overview.previous.pageviews} />
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Avg session</div>
          <div className="mt-1 text-3xl font-bold">{fmtDuration(overview.current.avgSessionSeconds)}</div>
          <Delta
            current={overview.current.avgSessionSeconds}
            previous={overview.previous.avgSessionSeconds}
          />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily sessions — last 90 days</CardTitle>
        </CardHeader>
        <CardContent>
          <TrafficChart data={daily} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Most read — last 28 days</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {pages.map((p) => (
                <li key={p.path} className="flex items-center justify-between gap-4 py-2 text-sm">
                  <a
                    href={`${mag.siteUrl}${p.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 truncate hover:text-primary hover:underline"
                    title={p.title}
                  >
                    {p.title.replace(/ [-|–] (MEPCA|hotel magazine|Bar Magazine|Care Home Magazine|Total Grooming).*$/i, "")}
                  </a>
                  <span className="shrink-0 font-semibold text-primary">{num(p.views)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where visitors come from</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {channels.map((c) => (
                <li key={c.channel} className="text-sm">
                  <div className="mb-1 flex items-center justify-between">
                    <span>{c.channel}</span>
                    <span className="text-muted-foreground">{num(c.sessions)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5">
                    <div
                      className="h-2 rounded-full bg-cyan-500/70"
                      style={{ width: `${Math.round((c.sessions / maxChannel) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Google search performance
            <span className="ml-3 text-sm font-normal text-muted-foreground">
              last 30 days (Search Console lags ~2 days)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Clicks</div>
              <div className="text-2xl font-bold">{num(Math.round(search.current.clicks))}</div>
              <Delta current={search.current.clicks} previous={search.previous.clicks} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Impressions</div>
              <div className="text-2xl font-bold">{num(Math.round(search.current.impressions))}</div>
              <Delta current={search.current.impressions} previous={search.previous.impressions} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">CTR</div>
              <div className="text-2xl font-bold">{(search.current.ctr * 100).toFixed(1)}%</div>
              <Delta current={search.current.ctr} previous={search.previous.ctr} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">Avg position</div>
              <div className="text-2xl font-bold">{search.current.position.toFixed(1)}</div>
              <Delta current={search.current.position} previous={search.previous.position} invert />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Top search queries
            </h3>
            <ul className="divide-y divide-border">
              {queries.map((q) => (
                <li key={q.keys![0]} className="flex items-center justify-between py-2 text-sm">
                  <span className="min-w-0 truncate">{q.keys![0]}</span>
                  <span className="flex shrink-0 gap-5 text-muted-foreground">
                    <span>{num(Math.round(q.clicks))} clicks</span>
                    <span>pos {q.position.toFixed(1)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
