// App-level kill switch (spec §9.2.4): a daily turn counter, cheap insurance if
// the auth cookie ever leaks. `/api/chat` returns 429 once the day's persisted
// Turn count reaches the limit. The window resets at 00:00 UTC.

import type { PrismaClient } from "@/app/generated/prisma/client";

export const DAILY_TURN_LIMIT = 1000;

/** Midnight UTC of the given instant. */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Count turns persisted since the start of the current UTC day and report
 * whether the limit has been reached. `exceeded` is true at or above the limit.
 */
export async function checkDailyLimit(
  prisma: Pick<PrismaClient, "turn">,
  now: Date = new Date(),
  limit: number = DAILY_TURN_LIMIT,
): Promise<{ count: number; exceeded: boolean }> {
  const count = await prisma.turn.count({
    where: { createdAt: { gte: startOfUtcDay(now) } },
  });
  return { count, exceeded: count >= limit };
}
