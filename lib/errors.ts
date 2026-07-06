// Error classification helpers (Phase 3 item 13).
//
// Turns raw failures (DOMExceptions from getUserMedia, fetch TypeErrors, HTTP
// status codes, empty recordings) into a small, closed set of error kinds and
// short, friendly English messages the chat UI can surface. Pure functions —
// no DOM or network access — so they're trivially unit-testable.

export type ErrorKind =
  | "mic-permission"
  | "no-mic"
  | "empty-recording"
  | "network"
  | "rate-limit"
  | "auth"
  | "server"
  | "unknown";

// Minimum viable recording length. Anything below this is treated as an
// accidental tap rather than real speech.
const MIN_RECORDING_MS = 300;

/**
 * Classify a thrown value into an {@link ErrorKind}.
 *
 * - DOMException `NotAllowedError` / `SecurityError` → `mic-permission`
 * - DOMException `NotFoundError` / `DevicesNotFoundError` → `no-mic`
 * - `TypeError` or an error whose message reads "Failed to fetch" → `network`
 * - anything else → `unknown`
 */
export function classifyError(err: unknown): ErrorKind {
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;

    if (name === "NotAllowedError" || name === "SecurityError") {
      return "mic-permission";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "no-mic";
    }

    const message = (err as { message?: unknown }).message;
    if (
      name === "TypeError" ||
      err instanceof TypeError ||
      (typeof message === "string" && /failed to fetch/i.test(message))
    ) {
      return "network";
    }
  }

  return "unknown";
}

/**
 * Classify an HTTP status code into an {@link ErrorKind}.
 *
 * - 401 / 403 → `auth`
 * - 429 → `rate-limit`
 * - >= 500 → `server`
 * - anything else → `unknown`
 */
export function classifyHttpStatus(status: number): ErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limit";
  if (status >= 500) return "server";
  return "unknown";
}

/**
 * True when a recording should be discarded as empty: no blob, a zero-byte
 * blob, or a duration below {@link MIN_RECORDING_MS}. When `durationMs` is
 * omitted, only the blob size is considered.
 */
export function isEmptyRecording(
  blob: { size: number } | null,
  durationMs?: number,
): boolean {
  if (!blob || blob.size === 0) return true;
  if (typeof durationMs === "number" && durationMs < MIN_RECORDING_MS) return true;
  return false;
}

/** Short, friendly English message for each {@link ErrorKind}. */
export function toUserMessage(kind: ErrorKind): string {
  switch (kind) {
    case "mic-permission":
      return "Microphone access is blocked. Enable it in your browser settings and try again.";
    case "no-mic":
      return "No microphone was found. Connect one and try again, or type your message instead.";
    case "empty-recording":
      return "I didn't catch that — the recording was empty. Hold the button and speak, then release.";
    case "network":
      return "Connection problem. Check your internet and try again.";
    case "rate-limit":
      return "You've hit today's practice limit. Come back tomorrow to keep going.";
    case "auth":
      return "Your session has expired. Please log in again.";
    case "server":
      return "Something went wrong on our end. Please try again in a moment.";
    default:
      return "Something went wrong. Please try again.";
  }
}
