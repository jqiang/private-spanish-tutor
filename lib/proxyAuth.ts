// Pure routing decision for the auth proxy, split out so it can be unit-tested
// without constructing a NextRequest. proxy.ts maps the outcome to NextResponse.

export type AuthOutcome =
  | { kind: "pass" }
  | { kind: "redirect"; location: string }
  | { kind: "unauthorized" };

export const LOGIN_PATH = "/login";

/** Paths the proxy must never gate — otherwise login is unreachable. */
function isPublicPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === "/api/login";
}

/**
 * Decide what to do with a request given whether its auth cookie verified.
 * Unauthenticated `/api/*` gets a 401 (a client fetch, not a browser nav);
 * unauthenticated pages redirect to /login.
 */
export function authOutcome(pathname: string, authorized: boolean): AuthOutcome {
  if (authorized || isPublicPath(pathname)) return { kind: "pass" };
  if (pathname.startsWith("/api/")) return { kind: "unauthorized" };
  return { kind: "redirect", location: LOGIN_PATH };
}
