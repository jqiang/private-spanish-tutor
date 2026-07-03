import type { Correction } from "@/lib/types";

const TYPE_LABEL: Record<Correction["type"], string> = {
  grammar: "grammar",
  vocabulary: "vocabulary",
  naturalness: "naturalness",
  spelling: "spelling",
};

export default function CorrectionCard({ c }: { c: Correction }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-amber-700 line-through decoration-amber-400">
          {c.original}
        </span>
        <span className="text-amber-400">→</span>
        <span className="font-semibold text-amber-900">{c.corrected}</span>
        <span className="ml-auto rounded bg-amber-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800">
          {TYPE_LABEL[c.type]}
        </span>
      </div>
      <p className="text-amber-800">{c.explanation}</p>
    </div>
  );
}
