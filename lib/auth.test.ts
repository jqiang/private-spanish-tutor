import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE,
  COOKIE_MAX_AGE_MS,
  constantTimeEqual,
  signAuthToken,
  verifyAuthToken,
  verifyPassword,
} from "./auth";

const SECRET = "test-secret-at-least-32-bytes-long-xxxxx";

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("hunter2", "hunter2")).toBe(true);
  });

  it("returns false for different strings of equal length", () => {
    expect(constantTimeEqual("hunter2", "hunterX")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("handles empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
    expect(constantTimeEqual("", "x")).toBe(false);
  });
});

describe("verifyPassword", () => {
  it("accepts the correct password", () => {
    expect(verifyPassword("swordfish", "swordfish")).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(verifyPassword("swordfish", "swordfisH")).toBe(false);
  });

  it("rejects when either side is empty", () => {
    expect(verifyPassword("", "swordfish")).toBe(false);
    expect(verifyPassword("swordfish", "")).toBe(false);
    expect(verifyPassword("", "")).toBe(false);
  });
});

describe("signAuthToken / verifyAuthToken", () => {
  it("round-trips a freshly signed token", async () => {
    const now = 1_000_000;
    const token = await signAuthToken(SECRET, now);
    expect(await verifyAuthToken(token, SECRET, now + 1000)).toBe(true);
  });

  it("embeds an expiry maxAge in the future", async () => {
    const now = 1_000_000;
    const token = await signAuthToken(SECRET, now);
    const [expiryStr] = token.split(".");
    expect(Number(expiryStr)).toBe(now + COOKIE_MAX_AGE_MS);
  });

  it("rejects an expired token", async () => {
    const now = 1_000_000;
    const token = await signAuthToken(SECRET, now, 1000); // expires at now+1000
    expect(await verifyAuthToken(token, SECRET, now + 2000)).toBe(false);
  });

  it("rejects a token signed with a different secret", async () => {
    const now = 1_000_000;
    const token = await signAuthToken(SECRET, now);
    expect(await verifyAuthToken(token, "another-secret", now)).toBe(false);
  });

  it("rejects a tampered expiry (signature no longer matches)", async () => {
    const now = 1_000_000;
    const token = await signAuthToken(SECRET, now, 1000);
    const sig = token.split(".")[1];
    const forged = `${now + 10_000_000}.${sig}`; // extend expiry, keep old sig
    expect(await verifyAuthToken(forged, SECRET, now)).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyAuthToken("", SECRET, 0)).toBe(false);
    expect(await verifyAuthToken("garbage", SECRET, 0)).toBe(false);
    expect(await verifyAuthToken(".sig", SECRET, 0)).toBe(false);
    expect(await verifyAuthToken("notanumber.sig", SECRET, 0)).toBe(false);
  });

  it("rejects when the secret is empty", async () => {
    expect(await verifyAuthToken("100.abc", "", 0)).toBe(false);
  });

  it("exposes a stable cookie name", () => {
    expect(AUTH_COOKIE).toBe("auth");
  });
});
