import { describe, expect, it } from "vitest";
import {
  MEMORY_MAX_CHARS,
  MEMORY_MAX_WORDS,
  MEMORY_SYSTEM_PROMPT,
  buildMemoryPrompt,
  clampProfileContent,
  formatTranscript,
  latestTurnDate,
  type MemoryTurn,
} from "./memory";

const turns: MemoryTurn[] = [
  {
    userText: "Hola, me llamo Jiqing.",
    replyText: "¡Mucho gusto, Jiqing!",
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
  },
  {
    userText: "Voy a viajar a México en septiembre.",
    replyText: "¡Qué emocionante! ¿A qué ciudad vas?",
    createdAt: "2026-07-25T09:30:00.000Z",
  },
];

describe("latestTurnDate", () => {
  it("returns the newest createdAt", () => {
    expect(latestTurnDate(turns).toISOString()).toBe(
      "2026-07-25T09:30:00.000Z",
    );
  });

  it("handles Date and string values alike", () => {
    const reversed = [...turns].reverse();
    expect(latestTurnDate(reversed).toISOString()).toBe(
      "2026-07-25T09:30:00.000Z",
    );
  });
});

describe("formatTranscript", () => {
  it("labels both sides and separates turns with a blank line", () => {
    const text = formatTranscript(turns);
    expect(text).toContain("Learner: Hola, me llamo Jiqing.");
    expect(text).toContain("Teacher: ¡Mucho gusto, Jiqing!");
    expect(text.split("\n\n")).toHaveLength(2);
  });

  it("returns an empty string for no turns", () => {
    expect(formatTranscript([])).toBe("");
  });
});

describe("clampProfileContent", () => {
  it("trims surrounding whitespace", () => {
    expect(clampProfileContent("  hola  \n")).toBe("hola");
  });

  it("caps content at MEMORY_MAX_CHARS", () => {
    const long = "x".repeat(MEMORY_MAX_CHARS + 500);
    expect(clampProfileContent(long)).toHaveLength(MEMORY_MAX_CHARS);
  });

  it("leaves short content unchanged", () => {
    expect(clampProfileContent("## About\n- learner")).toBe(
      "## About\n- learner",
    );
  });
});

describe("buildMemoryPrompt", () => {
  it("includes the current profile and the transcript", () => {
    const prompt = buildMemoryPrompt("- Name: Jiqing", turns);
    expect(prompt).toContain("Current memory:\n- Name: Jiqing");
    expect(prompt).toContain("Learner: Voy a viajar a México en septiembre.");
  });

  it("marks an empty profile as a first update", () => {
    expect(buildMemoryPrompt("   ", turns)).toContain(
      "(no memory yet — first update)",
    );
  });
});

describe("MEMORY_SYSTEM_PROMPT", () => {
  it("embeds the word budget and forbids commentary", () => {
    expect(MEMORY_SYSTEM_PROMPT).toContain(`${MEMORY_MAX_WORDS} words`);
    expect(MEMORY_SYSTEM_PROMPT).toContain("ONLY the revised memory");
  });
});
