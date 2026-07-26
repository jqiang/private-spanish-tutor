// Learner memory: the tutor's long-term knowledge about the user, kept as one
// short profile that is REVISED (not appended to) as sessions accumulate — like
// a person who remembers you, not a log. Pure helpers live here so the merge
// logic tests without a DB or an API key; the Claude call and Prisma reads/
// writes happen in app/api/memory/route.ts.

export const PROFILE_ID = "singleton";
export const MEMORY_MODEL = "claude-sonnet-4-6";
export const MEMORY_MAX_TOKENS = 1000;

/** Word budget the merge prompt asks the model to stay within. */
export const MEMORY_MAX_WORDS = 300;
/** Hard cap on stored profile text (model output and manual edits alike). */
export const MEMORY_MAX_CHARS = 4000;
/** Newest-first cap on turns folded in per update, to bound prompt tokens. */
export const MEMORY_MAX_TURNS = 100;

/** A persisted turn, as returned by prisma.turn.findMany. */
export interface MemoryTurn {
  userText: string;
  replyText: string;
  createdAt: Date | string;
}

/** LearnerProfile row as serialized over JSON (dates become strings). */
export interface LearnerProfileData {
  content: string;
  coveredUntil: Date | string | null;
  updatedAt: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Latest createdAt among turns — the new `coveredUntil` watermark. */
export function latestTurnDate(turns: MemoryTurn[]): Date {
  let max = 0;
  for (const t of turns) {
    const time = toDate(t.createdAt).getTime();
    if (time > max) max = time;
  }
  return new Date(max);
}

/** Compact transcript for the merge prompt. */
export function formatTranscript(turns: MemoryTurn[]): string {
  return turns
    .map((t) => `Learner: ${t.userText}\nTeacher: ${t.replyText}`)
    .join("\n\n");
}

/** Trim and enforce the hard character cap on profile content. */
export function clampProfileContent(content: string): string {
  const trimmed = content.trim();
  return trimmed.length > MEMORY_MAX_CHARS
    ? trimmed.slice(0, MEMORY_MAX_CHARS)
    : trimmed;
}

export const MEMORY_SYSTEM_PROMPT = `You maintain a Spanish tutor's memory of
their learner — the things a good teacher naturally remembers about a student
between lessons. You will receive the current memory and a transcript of recent
conversation. Return the REVISED memory.

Rules:
- Keep only durable, personal facts: name, family, work, home, interests,
  travel plans and past trips, preferences, recurring conversation topics,
  and notable learning preferences (e.g. "likes food vocabulary").
- Merge, don't append: integrate new facts, update anything that changed
  (e.g. a trip that happened is now a past trip), drop stale or trivial detail.
- Do NOT track grammar mistakes or vocabulary lists — the app stores those
  separately.
- Write terse English bullet points grouped under short headings.
- Stay under ${MEMORY_MAX_WORDS} words.
- If the transcript adds nothing durable, return the current memory unchanged.
- Output ONLY the revised memory text — no preamble, no commentary.`;

/** The user message for the merge call: current memory + new transcript. */
export function buildMemoryPrompt(
  currentProfile: string,
  turns: MemoryTurn[],
): string {
  const profile = currentProfile.trim() || "(no memory yet — first update)";
  return `Current memory:\n${profile}\n\nNew conversation since the last update:\n${formatTranscript(turns)}`;
}
