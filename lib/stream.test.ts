import { describe, expect, it } from "vitest";

import {
  createTeacherAccumulator,
  encodeSseEvent,
  extractPartialString,
  parseSseLine,
  type TeacherStreamEvent,
} from "./stream";
import type { TeacherResponse } from "./types";

// A complete, valid tool-input object as Claude would eventually produce it.
const fullTeacher: TeacherResponse = {
  corrections: [
    {
      original: "Yo tengo 20 años",
      corrected: "Yo tengo 20 años",
      explanation: 'She said "hola" which is fine.',
      type: "naturalness",
    },
  ],
  vocab_gaps: [
    {
      spanish: "mochila",
      english: "backpack",
      example: "Llevo una mochila.",
      source: "code-switch",
    },
  ],
  answer: null,
  reply: 'Perfecto. Me dijo "adiós"\ny seguimos.',
  reply_translation: "Perfect. You said goodbye and we continue.",
};

describe("extractPartialString", () => {
  it("returns '' when the key has not appeared yet", () => {
    expect(extractPartialString('{"corrections":[]', "reply")).toBe("");
  });

  it("returns '' when the key is present but the value has not started", () => {
    expect(extractPartialString('{"reply":', "reply")).toBe("");
    expect(extractPartialString('{"reply": ', "reply")).toBe("");
  });

  it("returns the running value of an unterminated string tail", () => {
    expect(extractPartialString('{"reply":"Hola, ¿cómo', "reply")).toBe(
      "Hola, ¿cómo",
    );
  });

  it("returns the full value of a terminated string", () => {
    expect(
      extractPartialString('{"reply":"Hola mundo","x":1}', "reply"),
    ).toBe("Hola mundo");
  });

  it("decodes an escaped quote inside the value (mid-stream)", () => {
    // The model streamed: reply = ' Dijo "sí" '  — still unterminated.
    expect(extractPartialString('{"reply":"Dijo \\"sí\\"', "reply")).toBe(
      'Dijo "sí"',
    );
  });

  it("decodes escaped newlines and backslashes", () => {
    expect(extractPartialString('{"reply":"line1\\nline2\\\\end', "reply")).toBe(
      "line1\nline2\\end",
    );
  });

  it("does not confuse 'reply' with 'reply_translation'", () => {
    // Only reply_translation is present — asking for reply must return "".
    expect(
      extractPartialString('{"reply_translation":"English gloss', "reply"),
    ).toBe("");
    expect(
      extractPartialString('{"reply_translation":"English gloss"}', "reply"),
    ).toBe("");
  });

  it("reads reply even when reply_translation precedes it", () => {
    const partial = '{"reply_translation":"gloss","reply":"Hola mund';
    expect(extractPartialString(partial, "reply")).toBe("Hola mund");
  });

  it("stops cleanly on a dangling escape backslash at the tail", () => {
    expect(extractPartialString('{"reply":"tail\\', "reply")).toBe("tail");
  });

  it("finds the key regardless of position in the object", () => {
    const partial =
      '{"corrections":[],"vocab_gaps":[],"answer":null,"reply":"Cont';
    expect(extractPartialString(partial, "reply")).toBe("Cont");
  });
});

describe("createTeacherAccumulator", () => {
  it("exposes the running reply as json deltas arrive", () => {
    const acc = createTeacherAccumulator();
    expect(acc.push('{"corrections":[],').reply).toBe("");
    expect(acc.push('"vocab_gaps":[],"answer":null,').reply).toBe("");
    expect(acc.push('"reply":"Hola').reply).toBe("Hola");
    expect(acc.push(', ¿qué').reply).toBe("Hola, ¿qué");
    expect(acc.push(' tal?"').reply).toBe("Hola, ¿qué tal?");
  });

  it("handles an escaped quote in the running reply", () => {
    const acc = createTeacherAccumulator();
    acc.push('{"reply":"Ella dijo ');
    expect(acc.push('\\"hola').reply).toBe('Ella dijo "hola');
    expect(acc.push('\\" ayer"').reply).toBe('Ella dijo "hola" ayer');
  });

  it("final() parses the completed object into a TeacherResponse", () => {
    const acc = createTeacherAccumulator();
    // Feed the serialized object in arbitrary chunks.
    const serialized = JSON.stringify(fullTeacher);
    const mid = Math.floor(serialized.length / 2);
    acc.push(serialized.slice(0, mid));
    acc.push(serialized.slice(mid));
    const result = acc.final();
    expect(result).toEqual(fullTeacher);
    // And the running reply matches the parsed reply (with the escaped quote decoded).
    expect(extractPartialString(serialized, "reply")).toBe(fullTeacher.reply);
  });
});

describe("SSE wire format", () => {
  it("round-trips a delta event", () => {
    const ev: TeacherStreamEvent = { type: "delta", reply: 'a "b" c' };
    const line = encodeSseEvent(ev);
    expect(line.startsWith("data: ")).toBe(true);
    expect(line.endsWith("\n\n")).toBe(true);
    expect(parseSseLine(line)).toEqual(ev);
  });

  it("round-trips a done event", () => {
    const ev: TeacherStreamEvent = {
      type: "done",
      teacher: fullTeacher,
      sessionId: "sess_123",
    };
    expect(parseSseLine(encodeSseEvent(ev))).toEqual(ev);
  });

  it("round-trips an error event", () => {
    const ev: TeacherStreamEvent = { type: "error", error: "boom" };
    expect(parseSseLine(encodeSseEvent(ev))).toEqual(ev);
  });

  it("returns null for a non-data line", () => {
    expect(parseSseLine(": keep-alive comment")).toBeNull();
    expect(parseSseLine("")).toBeNull();
    expect(parseSseLine("event: delta")).toBeNull();
  });

  it("returns null for a data line with malformed JSON", () => {
    expect(parseSseLine("data: {not json")).toBeNull();
  });
});
