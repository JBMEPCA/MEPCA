// Verifies the service account can read the e-shot calendar and shows event shapes
import { JWT } from "google-auth-library";

const auth = new JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

const calendarId = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID);
const timeMin = new Date().toISOString();
const timeMax = new Date(Date.now() + 90 * 86400000).toISOString();

const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=30`;
const res = await auth.request({ url });

console.log(`events in next 90 days: ${res.data.items.length}`);
for (const e of res.data.items.slice(0, 20)) {
  console.log(`- [${e.start?.date ?? e.start?.dateTime}] "${e.summary}"`);
}
