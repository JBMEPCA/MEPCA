import { JWT } from "google-auth-library";

// Shared Google service-account access (Calendar now; GA4/Search Console in milestone 2)

export function jwtClient(scopes: string[]) {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) return null;
  return new JWT({ email, key: key.replace(/\\n/g, "\n"), scopes });
}

export type EshotEvent = {
  date: Date;
  title: string; // cleaned, e.g. "Verder 2/3"
  raw: string;
};

// Sister-title prefixes that share the same calendar but aren't MEPCA sends
const OTHER_TITLES = /^(bar|hotel|salon|tgm|care home|boutique|barber|stand|id)\s*[-–]/i;

export async function listUpcomingEshots(days = 60): Promise<EshotEvent[] | null> {
  const auth = jwtClient(["https://www.googleapis.com/auth/calendar.readonly"]);
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!auth || !calendarId) return null;

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400000).toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=100`;

  try {
    const res = await auth.request<{
      items: { summary?: string; start?: { date?: string; dateTime?: string } }[];
    }>({ url });
    return res.data.items
      .filter((e) => e.summary && !OTHER_TITLES.test(e.summary.trim()))
      .map((e) => ({
        date: new Date(e.start?.date ?? e.start?.dateTime ?? 0),
        title: e.summary!.replace(/^mepca\s*[-–]\s*/i, "").trim(),
        raw: e.summary!,
      }));
  } catch (err) {
    console.error("calendar fetch failed", err);
    return null;
  }
}
