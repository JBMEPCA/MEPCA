import { createHmac, timingSafeEqual } from "node:crypto";

// Signed session token: base64url(JSON payload) + "." + base64url(HMAC).
// Lives in its own file (no Prisma import) so proxy.ts can verify tokens
// cheaply on every request.

export const SESSION_COOKIE = "cogent_session";

// How long a login lasts before the user must sign in again
export const REMEMBER_ME_DAYS = 30; // "Remember me" ticked
export const SHORT_SESSION_HOURS = 24; // unticked (cookie also dies with the browser)

export type SessionPayload = {
  userId: string;
  exp: number; // unix ms
  remember: boolean;
};

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set — add it to .env (and Vercel env vars)");
  return s;
}

function sign(data: string): string {
  return createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createSessionToken(userId: string, remember: boolean): string {
  const ttl = remember
    ? REMEMBER_ME_DAYS * 24 * 60 * 60 * 1000
    : SHORT_SESSION_HOURS * 60 * 60 * 1000;
  const payload: SessionPayload = { userId, exp: Date.now() + ttl, remember };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.userId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
