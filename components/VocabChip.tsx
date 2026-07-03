"use client";

import { useState } from "react";
import type { VocabGap } from "@/lib/types";

export default function VocabChip({ gap }: { gap: VocabGap }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
      >
        {gap.spanish}
        <span className="ml-1 text-emerald-500">· {gap.english}</span>
      </button>
      {open && (
        <p className="mt-1 max-w-xs text-xs italic text-emerald-700">
          {gap.example}
        </p>
      )}
    </div>
  );
}
