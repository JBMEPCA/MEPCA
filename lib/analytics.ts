import { jwtClient } from "@/lib/google";

// GA4 + Search Console data for the Analytics dashboard (milestone 2)

const GA_SCOPE = ["https://www.googleapis.com/auth/analytics.readonly"];
const GSC_SCOPE = ["https://www.googleapis.com/auth/webmasters.readonly"];

type Ga4Row = { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] };

async function runGa4Report(body: object): Promise<Ga4Row[]> {
  const auth = jwtClient(GA_SCOPE);
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!auth || !propertyId) throw new Error("GA4 not configured");
  const res = await auth.request<{ rows?: Ga4Row[] }>({
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    method: "POST",
    data: body,
  });
  return res.data.rows ?? [];
}

export type TrafficTotals = {
  sessions: number;
  users: number;
  pageviews: number;
  avgSessionSeconds: number;
};

async function totalsFor(startDate: string, endDate: string): Promise<TrafficTotals> {
  const rows = await runGa4Report({
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

export async function trafficOverview() {
  const [current, previous] = await Promise.all([
    totalsFor("28daysAgo", "today"),
    totalsFor("56daysAgo", "29daysAgo"),
  ]);
  return { current, previous };
}

export async function dailySessions(days = 90) {
  const rows = await runGa4Report({
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

export async function topPages(limit = 10) {
  const rows = await runGa4Report({
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

export async function trafficChannels() {
  const rows = await runGa4Report({
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

async function gscQuery(body: object): Promise<GscRow[]> {
  const auth = jwtClient(GSC_SCOPE);
  const site = process.env.GSC_SITE_URL;
  if (!auth || !site) throw new Error("Search Console not configured");
  const res = await auth.request<{ rows?: GscRow[] }>({
    url: `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    method: "POST",
    data: body,
  });
  return res.data.rows ?? [];
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function searchOverview() {
  // GSC data lags ~2 days, so windows end 2 days ago
  const [currentRows, previousRows] = await Promise.all([
    gscQuery({ startDate: isoDaysAgo(30), endDate: isoDaysAgo(2) }),
    gscQuery({ startDate: isoDaysAgo(58), endDate: isoDaysAgo(30) }),
  ]);
  const empty = { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  return { current: currentRows[0] ?? empty, previous: previousRows[0] ?? empty };
}

export async function topQueries(limit = 10) {
  return gscQuery({
    startDate: isoDaysAgo(30),
    endDate: isoDaysAgo(2),
    dimensions: ["query"],
    rowLimit: limit,
  });
}
