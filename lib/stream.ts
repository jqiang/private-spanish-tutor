// Streaming helpers for the teacher reply (Phase 3, item 11).
//
// /api/chat uses FORCED tool-use: the user-facing `reply` lives INSIDE the
// tool's JSON input, which the Anthropic SDK streams token-by-token as
// `input_json_delta` fragments. To show `reply` as it arrives we must read a
// single string field out of a growing, still-incomplete JSON string.
//
// This module is intentionally pure and dependency-free so it can be unit
// tested on both the server (encode) and the client (decode) sides.

import type { TeacherResponse } from "@/lib/types";

/**
 * Read the current best-effort value of a top-level string field out of an
 * incomplete JSON string.
 *
 * Handles the unterminated tail (value still streaming), escaped quotes, and
 * the common JSON escape sequences. Returns "" when the key has not appeared
 * yet, when its value has not started, or when the value is not a string.
 *
 * Best-effort by design: it scans for the quoted key token (`"key"` followed
 * by `:` and an opening quote). Because `"reply"` is only ever a top-level key
 * here — and never a substring of another key like `"reply_translation"` — a
 * literal token scan is safe for this schema.
 */
export function extractPartialString(partialJson: string, key: string): string {
  const needle = `"${key}"`;
  let searchStart = 0;

  for (;;) {
    const keyIdx = partialJson.indexOf(needle, searchStart);
    if (keyIdx === -1) return "";

    let i = keyIdx + needle.length;
    i = skipWhitespace(partialJson, i);

    // Must be followed by a colon to be a key (not e.g. a value that happens
    // to equal the key). Otherwise keep scanning for a later occurrence.
    if (partialJson[i] !== ":") {
      searchStart = keyIdx + needle.length;
      continue;
    }

    i = skipWhitespace(partialJson, i + 1);

    // Value not present yet, or not a string (null / number / object) — nothing
    // to surface as a partial string.
    if (i >= partialJson.length || partialJson[i] !== '"') return "";

    return readStringBody(partialJson, i + 1);
  }
}

function skipWhitespace(s: string, i: number): number {
  while (i < s.length && (s[i] === " " || s[i] === "\t" || s[i] === "\n" || s[i] === "\r")) {
    i++;
  }
  return i;
}

// Decode a JSON string body starting just after the opening quote. Stops at the
// closing unescaped quote, or at the end of the (still-incomplete) input.
function readStringBody(s: string, start: number): string {
  let out = "";
  let i = start;

  while (i < s.length) {
    const ch = s[i];

    if (ch === '"') {
      return out; // terminated string
    }

    if (ch === "\\") {
      // Incomplete escape at the tail — drop it and stop; the next chunk will
      // complete it and we'll re-decode from scratch.
      if (i + 1 >= s.length) return out;

      const esc = s[i + 1];
      switch (esc) {
        case '"':
          out += '"';
          break;
        case "\\":
          out += "\\";
          break;
        case "/":
          out += "/";
          break;
        case "n":
          out += "\n";
          break;
        case "t":
          out += "\t";
          break;
        case "r":
          out += "\r";
          break;
        case "b":
          out += "\b";
          break;
        case "f":
          out += "\f";
          break;
        case "u": {
          const hex = s.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 6;
            continue;
          }
          // Incomplete \uXXXX escape at the tail — stop here.
          return out;
        }
        default:
          out += esc;
          break;
      }
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  return out; // unterminated tail
}

/**
 * Accumulates `input_json_delta` fragments, exposing the running `reply` on
 * every push and parsing the completed tool input at the end.
 */
export interface TeacherAccumulator {
  /** Append a json fragment; returns the running reply so far. */
  push(deltaJson: string): { reply: string };
  /** Parse the fully-accumulated buffer into a TeacherResponse. */
  final(): TeacherResponse;
  /** The raw accumulated JSON (mostly for debugging/tests). */
  readonly raw: string;
}

export function createTeacherAccumulator(): TeacherAccumulator {
  let buf = "";
  return {
    push(deltaJson: string) {
      buf += deltaJson;
      return { reply: extractPartialString(buf, "reply") };
    },
    final(): TeacherResponse {
      return JSON.parse(buf) as TeacherResponse;
    },
    get raw() {
      return buf;
    },
  };
}

// --- SSE wire format -------------------------------------------------------
//
// The route emits newline-delimited SSE `data:` lines. Keep encode (server)
// and decode (client) symmetric and unit-tested so the client can trust the
// shapes it receives.

export type TeacherStreamEvent =
  | { type: "delta"; reply: string }
  | { type: "done"; teacher: TeacherResponse; sessionId?: string }
  | { type: "error"; error: string };

/** Encode one event as a complete SSE message (`data: {...}\n\n`). */
export function encodeSseEvent(event: TeacherStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Decode a single SSE line into a TeacherStreamEvent. Returns null for
 * non-data lines (comments, blank lines, other SSE fields) and for malformed
 * JSON payloads.
 */
export function parseSseLine(line: string): TeacherStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;

  const payload = trimmed.slice("data:".length).trim();
  if (!payload) return null;

  try {
    return JSON.parse(payload) as TeacherStreamEvent;
  } catch {
    return null;
  }
}
