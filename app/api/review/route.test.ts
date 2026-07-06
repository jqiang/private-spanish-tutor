import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Prisma singleton so the route runs without a real libSQL client.
const { mistakeFindMany, vocabFindMany, vocabUpdate } = vi.hoisted(() => ({
  mistakeFindMany: vi.fn(),
  vocabFindMany: vi.fn(),
  vocabUpdate: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  default: {
    mistake: { findMany: mistakeFindMany },
    vocabItem: { findMany: vocabFindMany, update: vocabUpdate },
  },
}));

import { GET, PATCH } from "./route";

function get(query: string) {
  return GET(new Request(`http://localhost/api/review${query}`));
}

function patch(body: unknown) {
  return PATCH(
    new Request("http://localhost/api/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  mistakeFindMany.mockReset();
  vocabFindMany.mockReset();
  vocabUpdate.mockReset();
});

describe("GET /api/review — mistakes tab", () => {
  it("returns grouped mistakes sorted by count DESC", async () => {
    mistakeFindMany.mockResolvedValue([
      {
        id: "1",
        type: "grammar",
        original: "o",
        corrected: "c",
        explanation: "e",
        turnId: "t",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        id: "2",
        type: "grammar",
        original: "o",
        corrected: "c",
        explanation: "e",
        turnId: "t",
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
      {
        id: "3",
        type: "spelling",
        original: "o",
        corrected: "c",
        explanation: "e",
        turnId: "t",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    const res = await get("?tab=mistakes");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.groups.map((g: { type: string }) => g.type)).toEqual([
      "grammar",
      "spelling",
    ]);
    expect(data.groups[0].count).toBe(2);
  });
});

describe("GET /api/review — vocab tab", () => {
  it("returns items filtered and sorted per query", async () => {
    vocabFindMany.mockResolvedValue([
      { id: "a", timesSeen: 1, learned: false, lastSeen: new Date() },
      { id: "b", timesSeen: 5, learned: false, lastSeen: new Date() },
    ]);
    const res = await get("?tab=vocab&sort=timesSeen&filter=unlearned");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.items.map((v: { id: string }) => v.id)).toEqual(["b", "a"]);
  });

  it("rejects an invalid sort", async () => {
    const res = await get("?tab=vocab&sort=bogus");
    expect(res.status).toBe(400);
    expect(vocabFindMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid filter", async () => {
    const res = await get("?tab=vocab&filter=bogus");
    expect(res.status).toBe(400);
  });

  it("rejects an unknown tab", async () => {
    const res = await get("?tab=bogus");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/review — CSV export", () => {
  it("exports vocab as CSV with attachment headers", async () => {
    vocabFindMany.mockResolvedValue([
      {
        spanish: "hola",
        english: "hello",
        example: "Hola",
        source: "asked",
        timesSeen: 2,
        learned: false,
        firstSeen: new Date("2026-01-01T00:00:00Z"),
        lastSeen: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    const res = await get("?export=csv&tab=vocab");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    expect(res.headers.get("Content-Disposition")).toMatch(
      /attachment; filename=".*\.csv"/,
    );
    const body = await res.text();
    expect(body.split("\r\n")[0]).toContain("spanish");
    expect(body).toContain("hola");
  });

  it("exports mistakes as CSV", async () => {
    mistakeFindMany.mockResolvedValue([
      {
        original: "o",
        corrected: "c",
        explanation: "e",
        type: "grammar",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ]);
    const res = await get("?export=csv&tab=mistakes");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/csv/);
    const body = await res.text();
    expect(body).toContain("grammar");
  });
});

describe("PATCH /api/review — mark learned", () => {
  it("updates the vocab item's learned flag", async () => {
    vocabUpdate.mockResolvedValue({ id: "v1", learned: true });
    const res = await patch({ id: "v1", learned: true });
    expect(res.status).toBe(200);
    expect(vocabUpdate).toHaveBeenCalledWith({
      where: { id: "v1" },
      data: { learned: true },
    });
    const data = await res.json();
    expect(data.item.learned).toBe(true);
  });

  it("400s when id is missing", async () => {
    const res = await patch({ learned: true });
    expect(res.status).toBe(400);
    expect(vocabUpdate).not.toHaveBeenCalled();
  });

  it("400s when learned is not a boolean", async () => {
    const res = await patch({ id: "v1", learned: "yes" });
    expect(res.status).toBe(400);
    expect(vocabUpdate).not.toHaveBeenCalled();
  });

  it("400s on invalid JSON", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/review", {
        method: "PATCH",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });
});
