// Verifies GA4 and Search Console access for milestone 2
import { JWT } from "google-auth-library";

const key = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
const email = process.env.GOOGLE_CLIENT_EMAIL;

// GA4: sessions + users over the last 7 days
const ga = new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/analytics.readonly"] });
try {
  const res = await ga.request({
    url: `https://analyticsdata.googleapis.com/v1beta/properties/${process.env.GA4_PROPERTY_ID}:runReport`,
    method: "POST",
    data: {
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
      metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
    },
  });
  console.log("GA4 OK — last 7 days:", JSON.stringify(res.data.rows?.[0]?.metricValues));
} catch (e) {
  console.log("GA4 FAILED:", e.response?.data?.error?.message ?? e.message);
}

// Search Console: which properties can the robot see?
const gsc = new JWT({ email, key, scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
try {
  const res = await gsc.request({ url: "https://www.googleapis.com/webmasters/v3/sites" });
  console.log("GSC sites:", JSON.stringify(res.data.siteEntry?.map((s) => `${s.siteUrl} (${s.permissionLevel})`)));
} catch (e) {
  console.log("GSC FAILED:", e.response?.data?.error?.message ?? e.message);
}
