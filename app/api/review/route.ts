// /review data layer (Phase 3, item 10). Serves the mistakes + vocabulary
// review page: grouped mistakes, filtered/sorted vocab, CSV export, and a PATCH
// to toggle a vocab item's `learned` flag.

import prisma from "@/lib/db";
import {
  groupMistakesByType,
  sortVocab,
  toCsv,
  type VocabFilter,
  type VocabSortKey,
} from "@/lib/review";

export const runtime = "nodejs";

const VOCAB_SORTS: VocabSortKey[] = ["timesSeen", "lastSeen"];
const VOCAB_FILTERS: VocabFilter[] = ["all", "learned", "unlearned"];

const VOCAB_CSV_COLUMNS = [
  "spanish",
  "english",
  "example",
  "source",
  "timesSeen",
  "learned",
  "firstSeen",
  "lastSeen",
];
const MISTAKE_CSV_COLUMNS = [
  "original",
  "corrected",
  "explanation",
  "type",
  "createdAt",
];

function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tab = searchParams.get("tab") ?? "mistakes";
  const isCsv = searchParams.get("export") === "csv";

  if (tab !== "mistakes" && tab !== "vocab") {
    return Response.json(
      { error: "`tab` must be 'mistakes' or 'vocab'." },
      { status: 400 },
    );
  }

  if (tab === "mistakes") {
    const mistakes = await prisma.mistake.findMany({
      orderBy: { createdAt: "desc" },
    });
    if (isCsv) {
      return csvResponse(
        toCsv(
          mistakes as unknown as Record<string, unknown>[],
          MISTAKE_CSV_COLUMNS,
        ),
        "mistakes.csv",
      );
    }
    return Response.json({ groups: groupMistakesByType(mistakes) });
  }

  // tab === "vocab"
  const sort = searchParams.get("sort") ?? "timesSeen";
  const filter = searchParams.get("filter") ?? "all";

  if (!VOCAB_SORTS.includes(sort as VocabSortKey)) {
    return Response.json(
      { error: "`sort` must be 'timesSeen' or 'lastSeen'." },
      { status: 400 },
    );
  }
  if (!VOCAB_FILTERS.includes(filter as VocabFilter)) {
    return Response.json(
      { error: "`filter` must be 'all', 'learned', or 'unlearned'." },
      { status: 400 },
    );
  }

  const rows = await prisma.vocabItem.findMany();
  const items = sortVocab(rows, {
    sort: sort as VocabSortKey,
    filter: filter as VocabFilter,
  });

  if (isCsv) {
    return csvResponse(
      toCsv(items as unknown as Record<string, unknown>[], VOCAB_CSV_COLUMNS),
      "vocab.csv",
    );
  }
  return Response.json({ items });
}

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { id, learned } = (body ?? {}) as { id?: unknown; learned?: unknown };
  if (typeof id !== "string" || id.length === 0) {
    return Response.json(
      { error: "`id` (non-empty string) is required." },
      { status: 400 },
    );
  }
  if (typeof learned !== "boolean") {
    return Response.json(
      { error: "`learned` must be a boolean." },
      { status: 400 },
    );
  }

  try {
    const item = await prisma.vocabItem.update({
      where: { id },
      data: { learned },
    });
    return Response.json({ item });
  } catch (err) {
    console.error("Vocab update failed:", err);
    return Response.json(
      { error: "Vocab item not found." },
      { status: 404 },
    );
  }
}
