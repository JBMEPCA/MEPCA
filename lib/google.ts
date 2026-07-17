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

// Sister-title prefixes on the main shared calendar that aren't MEPCA sends.
// MEPCA's own events there are either "MEPCA - …" or unprefixed, so MEPCA
// keeps everything EXCEPT these; each sister title keeps ONLY its own prefix.
const SISTER_PREFIXES = /^(bar|hotel|salon|tgm|care home|boutique|barber|stand|id)\s*[-–]/i;

// Per-magazine prefix rules. In practice BOTH calendars (the original
// jontheface86 one in GOOGLE_CALENDAR_ID and the "CIM ONLINE" one in
// GOOGLE_CALENDAR_ID_ONLINE) carry a mix of titles, so every magazine reads
// both and keeps only its own events. Unprefixed events count as MEPCA's, but
// only on the main calendar (that's the long-standing convention there).
const MAGAZINE_PREFIX: Record<string, { include: RegExp; strip: RegExp }> = {
  mepca: { include: /^mepca\s*[-–]/i, strip: /^mepca\s*[-–]\s*/i },
  bar: { include: /^bar\s*[-–]/i, strip: /^bar\s*[-–]\s*/i },
  hotel: { include: /^hotel\s*[-–]/i, strip: /^hotel\s*[-–]\s*/i },
  "care-home": { include: /^care\s*home\s*[-–]/i, strip: /^care\s*home\s*[-–]\s*/i },
  grooming: {
    include: /^(?:tgm|total\s*grooming|grooming)\s*[-–]/i,
    strip: /^(?:tgm|total\s*grooming|grooming)\s*[-–]\s*/i,
  },
};

type RawEvent = { summary?: string; start?: { date?: string; dateTime?: string } };

async function calendarEvents(calendarId: string, days: number): Promise<RawEvent[]> {
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 86400000).toISOString();
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
    `?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=100`;
  const data = await googleRequest<{ items: RawEvent[] }>(
    ["https://www.googleapis.com/auth/calendar.readonly"],
    url
  );
  return data.items ?? [];
}

export async function listUpcomingEshots(
  magazineSlug: string,
  days = 60
): Promise<EshotEvent[] | null> {
  const rule = MAGAZINE_PREFIX[magazineSlug];
  const mainId = process.env.GOOGLE_CALENDAR_ID;
  const onlineId = process.env.GOOGLE_CALENDAR_ID_ONLINE;
  if (!hasGoogleCreds() || !rule || (!mainId && !onlineId)) return null;

  try {
    // Tolerate one calendar failing — half a schedule beats an error page.
    const [main, online] = await Promise.all([
      mainId ? calendarEvents(mainId, days).catch(() => []) : [],
      onlineId ? calendarEvents(onlineId, days).catch(() => []) : [],
    ]);

    const keep = (e: RawEvent, unprefixedIsMepca: boolean): boolean => {
      const s = e.summary?.trim();
      if (!s) return false;
      if (rule.include.test(s)) return true;
      // Unprefixed events on the main calendar are MEPCA sends by convention.
      return magazineSlug === "mepca" && unprefixedIsMepca && !SISTER_PREFIXES.test(s);
    };

    return [
      ...main.filter((e) => keep(e, true)),
      ...online.filter((e) => keep(e, false)),
    ]
      .map((e) => ({
        date: new Date(e.start?.date ?? e.start?.dateTime ?? 0),
        title: e.summary!.trim().replace(rule.strip, "").trim(),
        raw: e.summary!,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  } catch (err) {
    console.error("calendar fetch failed", err);
    return null;
  }
}
