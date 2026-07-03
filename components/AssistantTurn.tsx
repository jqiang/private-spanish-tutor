"use client";

import { useState } from "react";
import type { TeacherResponse } from "@/lib/types";
import CorrectionCard from "./CorrectionCard";
import VocabChip from "./VocabChip";

export default function AssistantTurn({ t }: { t: TeacherResponse }) {
  const [showTranslation, setShowTranslation] = useState(false);

  return (
    <div className="space-y-3">
      {t.corrections?.length > 0 && (
        <div className="space-y-2">
          {t.corrections.map((c, i) => (
            <CorrectionCard key={i} c={c} />
          ))}
        </div>
      )}

      {t.vocab_gaps?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {t.vocab_gaps.map((g, i) => (
            <VocabChip key={i} gap={g} />
          ))}
        </div>
      )}

      {t.answer && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900 whitespace-pre-wrap">
          {t.answer}
        </div>
      )}

      <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
        <p className="text-slate-900">{t.reply}</p>
        <button
          type="button"
          onClick={() => setShowTranslation((s) => !s)}
          className="mt-2 text-xs text-slate-400 hover:text-slate-600"
        >
          {showTranslation ? "Hide translation" : "Show translation"}
        </button>
        {showTranslation && (
          <p className="mt-1 text-sm italic text-slate-500">
            {t.reply_translation}
          </p>
        )}
      </div>
    </div>
  );
}
