import { createSign } from "node:crypto";

// Shared Google service-account access (Calendar, GA4, Search Console).
//
// Deliberately does NOT use google-auth-library/gaxios for the requests:
// gaxios v7's fetch handling trips over Next 16's patched fetch in dev
// ("ArrayBuffer is not detachable"), 500ing any page that loads Google data.
// Plain fetch with a self-signed JWT bearer token works everywhere, so the
// OAuth token exchange is done by hand here (RS256-signed assertion).

const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Access tokens live ~1h; cache one per scope set so a page with several
// Google calls only exchanges once.
const tokenCache = new Map<string, { token: string; exp: number }>();

function b64url(s: string): string {
  return Buffer.from(s).toString("base64url");
}

export function hasGoogleCreds(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
}

async function accessToken(scopes: string[]): Promise<string | null> {
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!email || !key) return null;

  const scope = scopes.join(" ");
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(scope);
  if (cached && cached.exp - 60 > now) return cached.token;

  const unsigned =
    b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) +
    "." +
    b64url(
      JSON.stringify({ iss: email, scope, aud: TOKEN_URL, iat: now, exp: now + 3600 })
    );
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(key).toString("base64url")}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache.set(scope, { token: data.access_token, exp: now + (data.expires_in ?? 3600) });
  return data.access_token;
}

// GET (no body) or POST (JSON body) a Google API endpoint with a bearer token.
export async function googleRequest<T>(
  scopes: string[],
  url: string,
  body?: object
): Promise<T> {
  const token = await accessToken(scopes);
  if (!token) throw new Error("Google credentials are not configured");
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Google API ${res.status} for ${url.split("?")[0]}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type EshotEvent = {
  date: Date;
  title: string; // cleaned, e.g. "Verder 2/3"
  raw: string;
};

// Sister-title prefixes on the shared calendar that aren't MEPCA sends.
// MEPCA's own events are either "MEPCA - …" or unprefixed, so MEPCA keeps
// everything EXCEPT these; each sister title keeps ONLY its own prefix.
const SISTER_PREFIXES = /^(bar|hotel|salon|tgm|care home|boutique|barber|stand|id)\s*[-–]/i;

// Which calendar each magazine's e-shots live on, and how to pick its events
// out. Hotel is booked on a separate calendar ("CIM ONLINE") shared with the
// service account; everyone else shares GOOGLE_CALENDAR_ID with a title prefix.
const CALENDAR_ROUTES: Record<
  string,
  { envVar: string; include?: RegExp; excludeSisters?: boolean; strip: RegExp }
> = {
  mepca: { envVar: "GOOGLE_CALENDAR_ID", excludeSisters: true, strip: /^mepca\s*[-–]\s*/i },
  bar: { envVar: "GOOGLE_CALENDAR_ID", include: /^bar\s*[-–]/i, strip: /^bar\s*[-–]\s*/i },
  "care-home": {
    envVar: "GOOGLE_CALENDAR_ID",
    include: /^care\s*home\s*[-–]/i,
    strip: /^care\s*home\s*[-–]\s*/i,
  },
  grooming: {
    envVar: "GOOGLE_CALENDAR_ID",
    include: /^(?:tgm|total\s*grooming|grooming)\s*[-–]/i,
    strip: /^(?:tgm|total\s*grooming|grooming)\s*[-–]\s*/i,
  },
  hotel: { envVar: "GOOGLE_CALENDAR_ID_HOTEL", strip: /^hotel\s*[-–]\s*/i },
};

export async function listUpcomingEshots(
  magazineSlug: string,
  days = 60
): Promise<EshotEvent[] | null> {
  const route = CALENDAR_ROUTES[magazineSlug];
  const calendarId = route ? process.env[route.envVar] : undefined;
  if (!hasGoogleCreds() || !route || !calendarId) return null;

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400000).toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=100`;

  try {
    const data = await googleRequest<{
      items: { summary?: string; start?: { date?: string; dateTime?: string } }[];
    }>(["https://www.googleapis.com/auth/calendar.readonly"], url);
    return data.items
      .filter((e) => {
        const s = e.summary?.trim();
        if (!s) return false;
        if (route.include && !route.include.test(s)) return false;
        if (route.excludeSisters && SISTER_PREFIXES.test(s)) return false;
        return true;
      })
      .map((e) => ({
        date: new Date(e.start?.date ?? e.start?.dateTime ?? 0),
        title: e.summary!.trim().replace(route.strip, "").trim(),
        raw: e.summary!,
      }));
  } catch (err) {
    console.error("calendar fetch failed", err);
    return null;
  }
}
