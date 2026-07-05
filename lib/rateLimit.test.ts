import { describe, expect, it, vi } from "vitest";
import { DAILY_TURN_LIMIT, checkDailyLimit, startOfUtcDay } from "./rateLimit";

describe("startOfUtcDay", () => {
  it("floors to midnight UTC", () => {
    const d = new Date("2026-07-04T15:42:10.500Z");
    expect(startOfUtcDay(d).toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  it("is idempotent on an already-floored date", () => {
    const d = new Date("2026-07-04T00:00:00.000Z");
    expect(startOfUtcDay(d).toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });
});

function fakePrisma(count: number) {
  return { turn: { count: vi.fn().mockResolvedValue(count) } };
}

describe("checkDailyLimit", () => {
  it("counts only turns since the start of the UTC day", async () => {
    const now = new Date("2026-07-04T15:00:00.000Z");
    const prisma = fakePrisma(3);
    await checkDailyLimit(prisma as never, now, 200);
    expect(prisma.turn.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: startOfUtcDay(now) } },
    });
  });

  it("is not exceeded below the limit", async () => {
    const res = await checkDailyLimit(fakePrisma(199) as never, new Date(), 200);
    expect(res).toEqual({ count: 199, exceeded: false });
  });

  it("is exceeded at exactly the limit", async () => {
    const res = await checkDailyLimit(fakePrisma(200) as never, new Date(), 200);
    expect(res.exceeded).toBe(true);
  });

  it("is exceeded above the limit", async () => {
    const res = await checkDailyLimit(fakePrisma(250) as never, new Date(), 200);
    expect(res.exceeded).toBe(true);
  });

  it("defaults to DAILY_TURN_LIMIT", async () => {
    const prisma = fakePrisma(DAILY_TURN_LIMIT - 1);
    const res = await checkDailyLimit(prisma as never);
    expect(res.exceeded).toBe(false);
  });

  it("uses a positive default limit", () => {
    expect(DAILY_TURN_LIMIT).toBeGreaterThan(0);
  });
});
