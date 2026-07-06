import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "@/lib/settings";

// A tiny in-memory storage stub implementing the slice of the Storage API we use.
function makeStorage(initial?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      map.set(key, value);
    },
    // exposed for assertions
    _map: map,
  };
}

describe("loadSettings", () => {
  it("returns defaults when the key is missing", () => {
    const storage = makeStorage();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults on malformed JSON", () => {
    const storage = makeStorage();
    storage.setItem("spanish-tutor:settings", "{not json");
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("returns defaults when the stored blob is not an object", () => {
    const storage = makeStorage();
    storage.setItem("spanish-tutor:settings", JSON.stringify("nope"));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem("spanish-tutor:settings", JSON.stringify(42));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem("spanish-tutor:settings", JSON.stringify(null));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps a too-low ttsSpeed up to 0.8", () => {
    const storage = makeStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, ttsSpeed: 0.1 });
    expect(loadSettings(storage).ttsSpeed).toBe(0.8);
  });

  it("clamps a too-high ttsSpeed down to 1.2", () => {
    const storage = makeStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, ttsSpeed: 5 });
    expect(loadSettings(storage).ttsSpeed).toBe(1.2);
  });

  it("falls back to the default ttsSpeed when it is not a finite number", () => {
    const storage = makeStorage();
    storage.setItem(
      "spanish-tutor:settings",
      JSON.stringify({ ttsSpeed: "fast" }),
    );
    expect(loadSettings(storage).ttsSpeed).toBe(DEFAULT_SETTINGS.ttsSpeed);
    storage.setItem(
      "spanish-tutor:settings",
      JSON.stringify({ ttsSpeed: Number.NaN }),
    );
    expect(loadSettings(storage).ttsSpeed).toBe(DEFAULT_SETTINGS.ttsSpeed);
  });

  it("coerces an invalid level to the default", () => {
    const storage = makeStorage();
    storage.setItem(
      "spanish-tutor:settings",
      JSON.stringify({ level: "C2" }),
    );
    expect(loadSettings(storage).level).toBe(DEFAULT_SETTINGS.level);
  });

  it("preserves every valid CEFR level", () => {
    const storage = makeStorage();
    for (const level of ["A1", "A2", "B1", "B2"] as const) {
      saveSettings(storage, { ...DEFAULT_SETTINGS, level });
      expect(loadSettings(storage).level).toBe(level);
    }
  });

  it("coerces booleans (truthy/falsy) for speak and speakCorrections", () => {
    const storage = makeStorage();
    storage.setItem(
      "spanish-tutor:settings",
      JSON.stringify({ speak: 0, speakCorrections: 1 }),
    );
    const loaded = loadSettings(storage);
    expect(loaded.speak).toBe(false);
    expect(loaded.speakCorrections).toBe(true);
  });

  it("tolerates partial and unknown fields, filling gaps with defaults", () => {
    const storage = makeStorage();
    storage.setItem(
      "spanish-tutor:settings",
      JSON.stringify({ level: "B1", wat: "ignored" }),
    );
    const loaded = loadSettings(storage);
    expect(loaded).toEqual({
      ...DEFAULT_SETTINGS,
      level: "B1",
    });
    // no stray keys leak through
    expect(Object.keys(loaded).sort()).toEqual(
      ["level", "speak", "speakCorrections", "ttsSpeed"].sort(),
    );
  });

  it("round-trips a full custom settings object", () => {
    const storage = makeStorage();
    const custom: Settings = {
      level: "B2",
      ttsSpeed: 1.1,
      speakCorrections: true,
      speak: false,
    };
    saveSettings(storage, custom);
    expect(loadSettings(storage)).toEqual(custom);
  });

  it("never throws", () => {
    const throwing = {
      getItem: () => {
        throw new Error("boom");
      },
    };
    expect(() => loadSettings(throwing)).not.toThrow();
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
  });
});

describe("saveSettings", () => {
  it("writes a JSON blob under the stable key that loadSettings reads back", () => {
    const storage = makeStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, level: "A1" });
    const raw = storage._map.get("spanish-tutor:settings");
    expect(raw).toBeTypeOf("string");
    expect(JSON.parse(raw as string).level).toBe("A1");
  });
});
