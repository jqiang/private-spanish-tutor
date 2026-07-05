import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AUTH_COOKIE, verifyAuthToken } from "@/lib/auth";
import { POST } from "./route";

const SECRET = "unit-test-secret-abcdefghijklmnopqrstuv";
const PASSWORD = "correct horse";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  process.env.AUTH_PASSWORD = PASSWORD;
  process.env.AUTH_COOKIE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.AUTH_PASSWORD;
  delete process.env.AUTH_COOKIE_SECRET;
});

describe("POST /api/login", () => {
  it("500s when auth is not configured", async () => {
    delete process.env.AUTH_PASSWORD;
    const res = await post({ password: PASSWORD });
    expect(res.status).toBe(500);
  });

  it("401s on an incorrect password", async () => {
    const res = await post({ password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie?.() ?? []).toHaveLength(0);
  });

  it("401s on a missing password field", async () => {
    const res = await post({});
    expect(res.status).toBe(401);
  });

  it("sets a valid, httpOnly auth cookie on success", async () => {
    const res = await post({ password: PASSWORD });
    expect(res.status).toBe(200);

    const setCookie = res.headers.getSetCookie().join(";");
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
    expect(setCookie).toContain("Path=/");

    // The issued cookie must verify against the same secret.
    const match = setCookie.match(new RegExp(`${AUTH_COOKIE}=([^;]+)`));
    const token = decodeURIComponent(match![1]);
    expect(await verifyAuthToken(token, SECRET)).toBe(true);
  });
});
