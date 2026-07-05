import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma singleton so we control the daily turn count without a DB.
// `vi.mock` is hoisted above imports, so the shared fn must come from vi.hoisted.
const { turnCount } = vi.hoisted(() => ({ turnCount: vi.fn() }));
vi.mock("@/lib/db", () => ({
  default: { turn: { count: turnCount } },
}));

// Stub the Anthropic SDK so the "below limit" path fails fast (502) instead of
// making a real network call. We only assert it's past the 429 gate.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: () => Promise.reject(new Error("stubbed: no network")),
    };
  },
}));

import { DAILY_TURN_LIMIT } from "@/lib/rateLimit";
import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const validBody = {
  messages: [{ role: "user", text: "Hola, ¿cómo estás?" }],
  level: "A2",
};

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  turnCount.mockReset();
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("POST /api/chat — daily turn limiter", () => {
  it("returns 429 once the daily limit is reached (without calling Claude)", async () => {
    turnCount.mockResolvedValue(DAILY_TURN_LIMIT);
    const res = await post(validBody);
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.error).toMatch(/limit/i);
  });

  it("does not 429 below the limit (proceeds toward the Claude call)", async () => {
    turnCount.mockResolvedValue(DAILY_TURN_LIMIT - 1);
    const res = await post(validBody);
    // Below the cap it must NOT be a 429. (It will fail later on the mocked
    // Claude call — 502 — since there is no real API, but that's past the gate.)
    expect(res.status).not.toBe(429);
  });

  it("still validates the body before checking the limit", async () => {
    const res = await post({ messages: [] });
    expect(res.status).toBe(400);
    expect(turnCount).not.toHaveBeenCalled();
  });
});
