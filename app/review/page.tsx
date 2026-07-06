"use client";

import { useState } from "react";
import Link from "next/link";
import ReviewMistakes from "@/components/ReviewMistakes";
import ReviewVocab from "@/components/ReviewVocab";

type Tab = "mistakes" | "vocab";

const TABS: { key: Tab; label: string }[] = [
  { key: "mistakes", label: "Mistakes" },
  { key: "vocab", label: "Vocabulary" },
];

export default function ReviewPage() {
  const [tab, setTab] = useState<Tab>("mistakes");

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-slate-800">
          Review
          <span className="ml-2 text-xs font-normal text-slate-400">
            mistakes &amp; vocabulary
          </span>
        </h1>
        <Link
          href="/"
          className="ml-auto rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        >
          ← Practice
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div className="flex gap-1 rounded-lg bg-slate-200/60 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === t.key
                    ? "bg-white text-slate-800 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "mistakes" ? <ReviewMistakes /> : <ReviewVocab />}
        </div>
      </div>
    </div>
  );
}
