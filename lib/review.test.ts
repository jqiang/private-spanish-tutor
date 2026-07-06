import { describe, expect, it } from "vitest";
import {
  groupMistakesByType,
  sortVocab,
  toCsv,
  type ReviewMistake,
  type ReviewVocabItem,
} from "./review";

function mistake(over: Partial<ReviewMistake>): ReviewMistake {
  return {
    id: "m",
    turnId: "t",
    original: "o",
    corrected: "c",
    explanation: "e",
    type: "grammar",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

function vocab(over: Partial<ReviewVocabItem>): ReviewVocabItem {
  return {
    id: "v",
    spanish: "hola",
    english: "hello",
    example: "Hola, ¿qué tal?",
    source: "asked",
    timesSeen: 1,
    learned: false,
    firstSeen: new Date("2026-01-01T00:00:00Z"),
    lastSeen: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

describe("groupMistakesByType", () => {
  it("groups by type and sorts groups by count DESC", () => {
    const groups = groupMistakesByType([
      mistake({ id: "1", type: "grammar" }),
      mistake({ id: "2", type: "vocabulary" }),
      mistake({ id: "3", type: "grammar" }),
      mistake({ id: "4", type: "grammar" }),
      mistake({ id: "5", type: "vocabulary" }),
      mistake({ id: "6", type: "spelling" }),
    ]);
    expect(groups.map((g) => g.type)).toEqual([
      "grammar",
      "vocabulary",
      "spelling",
    ]);
    expect(groups.map((g) => g.count)).toEqual([3, 2, 1]);
    expect(groups[0].items).toHaveLength(3);
  });

  it("orders items within a group most-recent-first", () => {
    const groups = groupMistakesByType([
      mistake({ id: "old", createdAt: new Date("2026-01-01T00:00:00Z") }),
      mistake({ id: "new", createdAt: new Date("2026-03-01T00:00:00Z") }),
      mistake({ id: "mid", createdAt: new Date("2026-02-01T00:00:00Z") }),
    ]);
    expect(groups[0].items.map((m) => m.id)).toEqual(["new", "mid", "old"]);
  });

  it("returns an empty array for no mistakes", () => {
    expect(groupMistakesByType([])).toEqual([]);
  });

  it("accepts createdAt as a string", () => {
    const groups = groupMistakesByType([
      mistake({ id: "a", createdAt: "2026-01-01T00:00:00Z" }),
      mistake({ id: "b", createdAt: "2026-05-01T00:00:00Z" }),
    ]);
    expect(groups[0].items.map((m) => m.id)).toEqual(["b", "a"]);
  });
});

describe("sortVocab", () => {
  const items = [
    vocab({
      id: "a",
      timesSeen: 3,
      learned: false,
      lastSeen: new Date("2026-01-01T00:00:00Z"),
    }),
    vocab({
      id: "b",
      timesSeen: 1,
      learned: true,
      lastSeen: new Date("2026-03-01T00:00:00Z"),
    }),
    vocab({
      id: "c",
      timesSeen: 5,
      learned: false,
      lastSeen: new Date("2026-02-01T00:00:00Z"),
    }),
  ];

  it("sorts by timesSeen DESC", () => {
    const out = sortVocab(items, { sort: "timesSeen", filter: "all" });
    expect(out.map((v) => v.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by lastSeen DESC", () => {
    const out = sortVocab(items, { sort: "lastSeen", filter: "all" });
    expect(out.map((v) => v.id)).toEqual(["b", "c", "a"]);
  });

  it("filters to learned only", () => {
    const out = sortVocab(items, { sort: "timesSeen", filter: "learned" });
    expect(out.map((v) => v.id)).toEqual(["b"]);
  });

  it("filters to unlearned only", () => {
    const out = sortVocab(items, { sort: "timesSeen", filter: "unlearned" });
    expect(out.map((v) => v.id)).toEqual(["c", "a"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...items];
    sortVocab(items, { sort: "timesSeen", filter: "all" });
    expect(items).toEqual(copy);
  });
});

describe("toCsv", () => {
  it("emits a header row followed by data rows", () => {
    const csv = toCsv(
      [
        { a: "1", b: "2" },
        { a: "3", b: "4" },
      ],
      ["a", "b"],
    );
    expect(csv).toBe("a,b\r\n1,2\r\n3,4");
  });

  it("emits only the header for empty rows", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b");
  });

  it("quotes values containing a comma", () => {
    expect(toCsv([{ a: "x,y" }], ["a"])).toBe('a\r\n"x,y"');
  });

  it("quotes and doubles interior double-quotes", () => {
    expect(toCsv([{ a: 'she said "hi"' }], ["a"])).toBe(
      'a\r\n"she said ""hi"""',
    );
  });

  it("quotes values containing newlines", () => {
    expect(toCsv([{ a: "line1\nline2" }], ["a"])).toBe('a\r\n"line1\nline2"');
    expect(toCsv([{ a: "line1\r\nline2" }], ["a"])).toBe(
      'a\r\n"line1\r\nline2"',
    );
  });

  it("stringifies numbers and booleans, and blanks null/undefined", () => {
    const csv = toCsv(
      [{ n: 5, b: true, empty: null, missing: undefined }],
      ["n", "b", "empty", "missing"],
    );
    expect(csv).toBe("n,b,empty,missing\r\n5,true,,");
  });

  it("only includes the requested columns, in order", () => {
    const csv = toCsv([{ b: "2", a: "1", c: "3" }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n1,2");
  });

  it("quotes a header containing a comma", () => {
    expect(toCsv([], ["a,b", "c"])).toBe('"a,b",c');
  });
});
