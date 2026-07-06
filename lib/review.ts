// Pure data-layer helpers for the /review page (Phase 3, item 10).
// No Prisma import here so these test without a DB — the route handler passes
// plain arrays fetched from the client.

import type { CorrectionType, VocabSource } from "@/lib/types";

/** A persisted mistake row, as returned by prisma.mistake.findMany. */
export interface ReviewMistake {
  id: string;
  turnId: string;
  original: string;
  corrected: string;
  explanation: string;
  type: CorrectionType | string;
  createdAt: Date | string;
}

/** A persisted vocab row, as returned by prisma.vocabItem.findMany. */
export interface ReviewVocabItem {
  id: string;
  spanish: string;
  english: string;
  example: string;
  source: VocabSource | string;
  timesSeen: number;
  learned: boolean;
  firstSeen: Date | string;
  lastSeen: Date | string;
}

export interface MistakeGroup {
  type: string;
  items: ReviewMistake[];
  count: number;
}

export type VocabSortKey = "timesSeen" | "lastSeen";
export type VocabFilter = "all" | "learned" | "unlearned";

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Group mistakes by their correction type. Groups are sorted by count DESC so
 * repeat-offender types ("common patterns") float to the top; within each group
 * items are ordered most-recent-first.
 */
export function groupMistakesByType(mistakes: ReviewMistake[]): MistakeGroup[] {
  const byType = new Map<string, ReviewMistake[]>();
  for (const m of mistakes) {
    const bucket = byType.get(m.type);
    if (bucket) bucket.push(m);
    else byType.set(m.type, [m]);
  }

  const groups: MistakeGroup[] = [];
  for (const [type, items] of byType) {
    items.sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt));
    groups.push({ type, items, count: items.length });
  }

  groups.sort((a, b) => b.count - a.count);
  return groups;
}

/** Filter then sort vocab (DESC on the chosen key). Returns a new array. */
export function sortVocab(
  items: ReviewVocabItem[],
  opts: { sort: VocabSortKey; filter: VocabFilter },
): ReviewVocabItem[] {
  const filtered = items.filter((v) => {
    if (opts.filter === "learned") return v.learned;
    if (opts.filter === "unlearned") return !v.learned;
    return true;
  });

  const sorted = [...filtered];
  if (opts.sort === "lastSeen") {
    sorted.sort((a, b) => toTime(b.lastSeen) - toTime(a.lastSeen));
  } else {
    sorted.sort((a, b) => b.timesSeen - a.timesSeen);
  }
  return sorted;
}

/** RFC-4180 escaping: quote when the value contains a comma, quote, CR, or LF. */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Serialize `rows` to an RFC-4180 CSV string with a header row built from
 * `columns` (only those keys are emitted, in order). Records are separated by
 * CRLF; an empty `rows` yields just the header line.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  const header = columns.map(escapeCsvValue).join(",");
  const body = rows.map((row) =>
    columns.map((col) => escapeCsvValue(row[col])).join(","),
  );
  return [header, ...body].join("\r\n");
}
