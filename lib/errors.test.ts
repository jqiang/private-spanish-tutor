import { describe, expect, it } from "vitest";
import {
  type ErrorKind,
  classifyError,
  classifyHttpStatus,
  isEmptyRecording,
  toUserMessage,
} from "./errors";

// Small helper: DOMException isn't always available in the node test env with a
// name-settable constructor, so fabricate an object with the shape classifyError
// inspects (a `name` property). Real DOMExceptions carry the same `name`.
function domException(name: string): DOMException {
  return { name, message: name } as unknown as DOMException;
}

describe("classifyError", () => {
  it("maps NotAllowedError to mic-permission", () => {
    expect(classifyError(domException("NotAllowedError"))).toBe("mic-permission");
  });

  it("maps SecurityError to mic-permission", () => {
    expect(classifyError(domException("SecurityError"))).toBe("mic-permission");
  });

  it("maps NotFoundError to no-mic", () => {
    expect(classifyError(domException("NotFoundError"))).toBe("no-mic");
  });

  it("maps DevicesNotFoundError to no-mic", () => {
    expect(classifyError(domException("DevicesNotFoundError"))).toBe("no-mic");
  });

  it("maps a real DOMException by name", () => {
    // Where the platform provides DOMException, use it directly.
    if (typeof DOMException !== "undefined") {
      expect(classifyError(new DOMException("nope", "NotAllowedError"))).toBe(
        "mic-permission",
      );
    }
  });

  it("maps TypeError to network", () => {
    expect(classifyError(new TypeError("boom"))).toBe("network");
  });

  it("maps a 'Failed to fetch' error to network", () => {
    expect(classifyError(new Error("Failed to fetch"))).toBe("network");
  });

  it("falls back to unknown for anything else", () => {
    expect(classifyError(new Error("weird"))).toBe("unknown");
    expect(classifyError("a string")).toBe("unknown");
    expect(classifyError(null)).toBe("unknown");
    expect(classifyError(undefined)).toBe("unknown");
    expect(classifyError({ name: "SomethingElse" })).toBe("unknown");
  });
});

describe("classifyHttpStatus", () => {
  it("maps 401 to auth", () => {
    expect(classifyHttpStatus(401)).toBe("auth");
  });

  it("maps 403 to auth", () => {
    expect(classifyHttpStatus(403)).toBe("auth");
  });

  it("maps 429 to rate-limit", () => {
    expect(classifyHttpStatus(429)).toBe("rate-limit");
  });

  it("maps 500 and above to server", () => {
    expect(classifyHttpStatus(500)).toBe("server");
    expect(classifyHttpStatus(502)).toBe("server");
    expect(classifyHttpStatus(503)).toBe("server");
  });

  it("falls back to unknown for other statuses", () => {
    expect(classifyHttpStatus(400)).toBe("unknown");
    expect(classifyHttpStatus(404)).toBe("unknown");
    expect(classifyHttpStatus(200)).toBe("unknown");
  });
});

describe("isEmptyRecording", () => {
  it("is true for a null blob", () => {
    expect(isEmptyRecording(null)).toBe(true);
  });

  it("is true for a zero-size blob", () => {
    expect(isEmptyRecording({ size: 0 })).toBe(true);
  });

  it("is true when duration is below the threshold", () => {
    expect(isEmptyRecording({ size: 1024 }, 100)).toBe(true);
  });

  it("is false for a non-empty blob with adequate duration", () => {
    expect(isEmptyRecording({ size: 1024 }, 2000)).toBe(false);
  });

  it("is false for a non-empty blob when duration is omitted", () => {
    expect(isEmptyRecording({ size: 1024 })).toBe(false);
  });

  it("treats duration exactly at the threshold as not-empty", () => {
    // Boundary: >= threshold is fine, only strictly-below is empty.
    expect(isEmptyRecording({ size: 1024 }, 300)).toBe(false);
    expect(isEmptyRecording({ size: 1024 }, 299)).toBe(true);
  });
});

describe("toUserMessage", () => {
  const kinds: ErrorKind[] = [
    "mic-permission",
    "no-mic",
    "empty-recording",
    "network",
    "rate-limit",
    "auth",
    "server",
    "unknown",
  ];

  it("returns a non-empty string for every kind", () => {
    for (const kind of kinds) {
      const msg = toUserMessage(kind);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it("gives distinct messages per kind", () => {
    const msgs = kinds.map(toUserMessage);
    expect(new Set(msgs).size).toBe(kinds.length);
  });

  it("mentions microphone for mic-permission", () => {
    expect(toUserMessage("mic-permission").toLowerCase()).toContain("microphone");
  });
});
