// Single-password cookie auth (spec §9.1).
//
// The cookie value is `${expiryMs}.${hmacHex}` where the signature is
// HMAC-SHA256(AUTH_COOKIE_SECRET, String(expiryMs)). Verifying re-computes the
// signature and constant-time compares it, then checks the embedded expiry.
//
// Uses Web Crypto (crypto.subtle) so the exact same code runs in the proxy and
// in the /api/login route handler — no Node `crypto` dependency.

export const AUTH_COOKIE = "auth";
export const COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const COOKIE_MAX_AGE_S = 90 * 24 * 60 * 60;

const encoder = new TextEncoder();

/**
 * Length-independent equality check. Loops over the longer input regardless of
 * where the first mismatch is, so comparison time doesn't leak the secret.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Timing-safe password comparison. Empty inputs always fail. */
export function verifyPassword(input: string, expected: string): boolean {
  if (!input || !expected) return false;
  return constantTimeEqual(input, expected);
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sign a token that expires at `now + maxAgeMs`. */
export async function signAuthToken(
  secret: string,
  now: number = Date.now(),
  maxAgeMs: number = COOKIE_MAX_AGE_MS,
): Promise<string> {
  const expiry = now + maxAgeMs;
  const sig = await hmacHex(secret, String(expiry));
  return `${expiry}.${sig}`;
}

/** Verify signature and expiry. Returns false for any malformed/expired input. */
export async function verifyAuthToken(
  token: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return false;

  const expiryStr = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry)) return false;

  const expected = await hmacHex(secret, expiryStr);
  if (!constantTimeEqual(sig, expected)) return false;

  return expiry > now;
}
