import { googleRequest, hasGoogleCreds } from "@/lib/google";
import { getMagazine } from "@/lib/magazines";

// GA4 + Search Console data for the Analytics dashboard, resolved per
// magazine via env suffixes (GA4_PROPERTY_ID_HOTEL, GSC_SITE_URL_HOTEL, …).
// MEPCA falls back to the original unsuffixed vars.

const GA_SCOPE = ["https://www.googleapis.com/auth/analytics.readonly"];
const GSC_SCOPE = ["https://www.googleapis.com/auth/webmasters.readonly"];

function ga4PropertyFor(slug: string): string | null {
  const mag = getMagazine(slug);
  if (!mag) return null;
  let id = process.env[`GA4_PROPERTY_ID_${mag.envSuffix}`] ?? "";
  if (slug === "mepca") id ||= process.env.GA4_PROPERTY_ID ?? "";
  return id || null;
}

function gscSiteFor(slug: string): string | null {
  const mag = getMagazine(slug);
  if (!mag) return null;
  let site = process.env[`GSC_SITE_URL_${mag.envSuffix}`] ?? "";
  if (slug === "mepca") site ||= process.env.GSC_SITE_URL ?? "";
  return site || null;
}

// Is this magazine's Google side fully connected (GA4 property + GSC site)?
export function hasAnalyticsConfig(slug: string): boolean {
  return ga4PropertyFor(slug) !== null && gscSiteFor(slug) !== null;
}

type Ga4Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };

async function runGa4Report(slug: string, body: object): Promise<Ga4Row[]> {
  const propertyId = ga4PropertyFor(slug);
  if (!hasGoogleCreds() || !propertyId) throw new Error("GA4 not configured");
  const data = await googleRequest<{ rows?: Ga4Row[] }>(
    GA_SCOPE,
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    body
  );
  return data.rows ?? [];
}

export type TrafficTotals = {
  sessions: number;
  users: number;
  pageviews: number;
  avgSessionSeconds: number;
};

async function totalsFor(slug: string, startDate: string, endDate: string): Promise<TrafficTotals> {
  const rows = await runGa4Report(slug, {
    dateRanges: [{ startDate, endDate }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "screenPageViews" },
      { name: "averageSessionDuration" },
    ],
  });
  const m = rows[0]?.metricValues ?? [];
  return {
    sessions: Number(m[0]?.value ?? 0),
    users: Number(m[1]?.value ?? 0),
    pageviews: Number(m[2]?.value ?? 0),
    avgSessionSeconds: Number(m[3]?.value ?? 0),
  };
}

export async function trafficOverview(slug: string) {
  const [current, previous] = await Promise.all([
    totalsFor(slug, "28daysAgo", "today"),
    totalsFor(slug, "56daysAgo", "29daysAgo"),
  ]);
  return { current, previous };
}

export async function dailySessions(slug: string, days = 90) {
  const rows = await runGa4Report(slug, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  return rows.map((r) => ({
    date: r.dimensionValues![0].value, // YYYYMMDD
    sessions: Number(r.metricValues![0].value),
  }));
}

export async function topPages(slug: string, limit = 10) {
  const rows = await runGa4Report(slug, {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  });
  return rows.map((r) => ({
    path: r.dimensionValues![0].value,
    title: r.dimensionValues![1].value,
    views: Number(r.metricValues![0].value),
  }));
}

export async function trafficChannels(slug: string) {
  const rows = await runGa4Report(slug, {
    dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });
  return rows.map((r) => ({
    channel: r.dimensionValues![0].value,
    sessions: Number(r.metricValues![0].value),
  }));
}

// ---------- Search Console ----------

type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function gscQuery(slug: string, body: object): Promise<GscRow[]> {
  const site = gscSiteFor(slug);
  if (!hasGoogleCreds() || !site) throw new Error("Search Console not configured");
  const data = await googleRequest<{ rows?: GscRow[] }>(
    GSC_SCOPE,
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    body
  );
  return data.rows ?? [];
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function searchOverview(slug: string) {
  // GSC data lags ~2 days, so windows end 2 days ago
  const [currentRows, previousRows] = await Promise.all([
    gscQuery(slug, { startDate: isoDaysAgo(30), endDate: isoDaysAgo(2) }),
    gscQuery(slug, { startDate: isoDaysAgo(58), endDate: isoDaysAgo(30) }),
  ]);
  const empty = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return { current: currentRows[0] ?? empty, previous: previousRows[0] ?? empty };
}

export async function topQueries(slug: string, limit = 10) {
  return gscQuery(slug, {
    startDate: isoDaysAgo(30),
    endDate: isoDaysAgo(2),
    dimensions: ["query"],
    rowLimit: limit,
  });
}
