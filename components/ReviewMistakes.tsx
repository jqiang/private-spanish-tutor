"use client";

import { useEffect, useState } from "react";
import type { MistakeGroup, ReviewMistake } from "@/lib/review";

const TYPE_LABEL: Record<string, string> = {
  grammar: "grammar",
  vocabulary: "vocabulary",
  naturalness: "naturalness",
  spelling: "spelling",
};

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MistakeRow({ m }: { m: ReviewMistake }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-baseline gap-2 text-left"
      >
        <span className="text-amber-700 line-through decoration-amber-400">
          {m.original}
        </span>
        <span className="text-amber-400">→</span>
        <span className="font-semibold text-amber-900">{m.corrected}</span>
        <span className="ml-auto shrink-0 text-[10px] text-amber-500">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          <p className="text-amber-800">{m.explanation}</p>
          <p className="text-[11px] text-amber-500">{formatDate(m.createdAt)}</p>
        </div>
      )}
    </div>
  );
}

export default function ReviewMistakes() {
  const [groups, setGroups] = useState<MistakeGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/review?tab=mistakes");
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        const data: { groups: MistakeGroup[] } = await res.json();
        if (!cancelled) setGroups(data.groups);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
    );
  }
  if (groups === null) {
    return <p className="text-sm text-slate-400">Cargando…</p>;
  }
  if (groups.length === 0) {
    return (
      <p className="text-center text-sm text-slate-400">
        No hay errores registrados todavía.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <a
          href="/api/review?export=csv&tab=mistakes"
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Download CSV
        </a>
      </div>
      {groups.map((g) => (
        <section key={g.type} className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-800">
              {TYPE_LABEL[g.type] ?? g.type}
            </h2>
            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
              {g.count}
            </span>
          </div>
          <div className="space-y-2">
            {g.items.map((m) => (
              <MistakeRow key={m.id} m={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
