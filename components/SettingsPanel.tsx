"use client";

import { useEffect, useRef, useState } from "react";
import type { Settings } from "@/lib/settings";
import type { CefrLevel } from "@/lib/types";

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2"];

// Settings popover (Phase 3, item 12). Replaces the ad-hoc header controls.
// Pure presentation: the parent owns the Settings object and persistence.
export default function SettingsPanel({
  settings,
  onChange,
  onNewSession,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  onNewSession: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Settings"
        className="flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border border-slate-300 px-2 text-sm text-slate-600 hover:bg-slate-100"
      >
        <span aria-hidden>⚙️</span>
        <span className="hidden text-xs sm:inline">{settings.level}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Settings"
          className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        >
          {/* Level */}
          <fieldset className="mb-4">
            <legend className="mb-1.5 text-xs font-medium text-slate-500">
              Level
            </legend>
            <div className="grid grid-cols-4 gap-1.5">
              {LEVELS.map((l) => {
                const active = settings.level === l;
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => set("level", l)}
                    aria-pressed={active}
                    className={`h-9 rounded-lg border text-sm font-medium transition-colors ${
                      active
                        ? "border-slate-800 bg-slate-800 text-white"
                        : "border-slate-300 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* TTS speed */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <label
                htmlFor="tts-speed"
                className="text-xs font-medium text-slate-500"
              >
                Voice speed
              </label>
              <span className="text-xs tabular-nums text-slate-400">
                {settings.ttsSpeed.toFixed(1)}×
              </span>
            </div>
            <input
              id="tts-speed"
              type="range"
              min={0.8}
              max={1.2}
              step={0.1}
              value={settings.ttsSpeed}
              onChange={(e) => set("ttsSpeed", Number(e.target.value))}
              className="h-9 w-full accent-slate-800"
            />
          </div>

          {/* Toggles */}
          <label className="mb-2 flex min-h-11 items-center justify-between gap-3 text-sm text-slate-700">
            <span>Speak replies</span>
            <input
              type="checkbox"
              checked={settings.speak}
              onChange={(e) => set("speak", e.target.checked)}
              className="h-5 w-5 accent-slate-800"
            />
          </label>
          <label className="mb-4 flex min-h-11 items-center justify-between gap-3 text-sm text-slate-700">
            <span>
              Speak corrections
              <span className="block text-xs text-slate-400">
                Read fixes aloud before the reply
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.speakCorrections}
              onChange={(e) => set("speakCorrections", e.target.checked)}
              className="h-5 w-5 accent-slate-800"
            />
          </label>

          <button
            type="button"
            onClick={() => {
              onNewSession();
              setOpen(false);
            }}
            className="h-11 w-full rounded-lg border border-slate-300 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            New session
          </button>
        </div>
      )}
    </div>
  );
}
