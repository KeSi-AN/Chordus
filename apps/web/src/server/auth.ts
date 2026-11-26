import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Optional access token for when the app is reachable from other devices (a phone on the same
 * Wi-Fi). Unset, nothing is checked, as before. Set `CHORDUS_API_TOKEN`, and every API call needs
 * `Authorization: Bearer <token>` (the Android app) or the cookie the /unlock page sets (a
 * browser). Single user, so one shared secret is enough; Auth.js comes with hosting (Phase 6).
 */
export const TOKEN_COOKIE = "chordus_token";

export class UnauthorizedError extends Error {
  constructor() {
    super("This Chordus server needs an access token");
    this.name = "UnauthorizedError";
  }
}

function digest(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

/** Constant-time comparison (hashing first gives both sides the same length). */
export function tokenMatches(expected: string, given: string | null | undefined): boolean {
  if (!given) return false;
  return timingSafeEqual(digest(expected), digest(given));
}

export interface Credentials {
  authorization: string | null;
  cookie: string | undefined;
}

export function isAuthorized(expected: string | undefined, creds: Credentials): boolean {
  if (!expected) return true;
  const bearer = /^Bearer\s+(.+)$/i.exec(creds.authorization?.trim() ?? "")?.[1];
  return tokenMatches(expected, bearer) || tokenMatches(expected, creds.cookie);
}

/** Where to go after unlocking: a path on this site only (no `//host` or absolute URLs). */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.includes("\\") || /[\u0000-\u001f]/.test(next)) return "/";
  return next;
}
