import { describe, expect, it } from "vitest";
import { authOutcome } from "./proxyAuth";

describe("authOutcome", () => {
  it("passes any path when authorized", () => {
    expect(authOutcome("/", true)).toEqual({ kind: "pass" });
    expect(authOutcome("/api/chat", true)).toEqual({ kind: "pass" });
    expect(authOutcome("/review", true)).toEqual({ kind: "pass" });
  });

  it("returns 401 for unauthenticated /api/* requests (no redirect)", () => {
    expect(authOutcome("/api/chat", false)).toEqual({ kind: "unauthorized" });
    expect(authOutcome("/api/tts", false)).toEqual({ kind: "unauthorized" });
  });

  it("redirects unauthenticated page requests to /login", () => {
    expect(authOutcome("/", false)).toEqual({
      kind: "redirect",
      location: "/login",
    });
    expect(authOutcome("/review", false)).toEqual({
      kind: "redirect",
      location: "/login",
    });
  });

  it("never redirects the login page onto itself (loop guard)", () => {
    expect(authOutcome("/login", false)).toEqual({ kind: "pass" });
    expect(authOutcome("/api/login", false)).toEqual({ kind: "pass" });
  });
});
