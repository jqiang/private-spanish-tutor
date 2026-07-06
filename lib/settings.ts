// Client settings persisted to localStorage (Phase 3, item 12).
//
// The panel UI reads/writes these; this module owns the storage format plus the
// validation & repair logic so a corrupted or hand-edited blob can never crash
// the app. All functions take a storage-like object (not the global
// `localStorage`) so they are unit-testable in a Node environment.

import type { CefrLevel } from "@/lib/types";

export interface Settings {
  level: CefrLevel;
  ttsSpeed: number;
  speakCorrections: boolean;
  speak: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  level: "A2",
  ttsSpeed: 1.0,
  speakCorrections: false,
  speak: true,
};

// Stable storage key — do not change without a migration.
const STORAGE_KEY = "spanish-tutor:settings";

const VALID_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2"];
const TTS_SPEED_MIN = 0.8;
const TTS_SPEED_MAX = 1.2;

function isCefrLevel(value: unknown): value is CefrLevel {
  return (
    typeof value === "string" && VALID_LEVELS.includes(value as CefrLevel)
  );
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function repairTtsSpeed(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.ttsSpeed;
  }
  return clamp(value, TTS_SPEED_MIN, TTS_SPEED_MAX);
}

/**
 * Read settings from storage, validating & repairing each field. Tolerates a
 * missing key, malformed JSON, non-object payloads, and partial/unknown fields.
 * Never throws — always returns a complete, valid Settings object.
 */
export function loadSettings(storage: Pick<Storage, "getItem">): Settings {
  let parsed: unknown;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw == null) return { ...DEFAULT_SETTINGS };
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ...DEFAULT_SETTINGS };
  }

  const blob = parsed as Record<string, unknown>;

  return {
    level: isCefrLevel(blob.level) ? blob.level : DEFAULT_SETTINGS.level,
    ttsSpeed: repairTtsSpeed(blob.ttsSpeed),
    speakCorrections:
      "speakCorrections" in blob
        ? Boolean(blob.speakCorrections)
        : DEFAULT_SETTINGS.speakCorrections,
    speak: "speak" in blob ? Boolean(blob.speak) : DEFAULT_SETTINGS.speak,
  };
}

/** Persist settings as a JSON blob under the stable key. */
export function saveSettings(
  storage: Pick<Storage, "setItem">,
  s: Settings,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(s));
}
