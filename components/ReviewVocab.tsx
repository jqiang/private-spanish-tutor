"use client";

import { useEffect, useState } from "react";
import type {
  ReviewVocabItem,
  VocabFilter,
  VocabSortKey,
} from "@/lib/review";

function formatDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ReviewVocab() {
  const [sort, setSort] = useState<VocabSortKey>("timesSeen");
  const [filter, setFilter] = useState<VocabFilter>("all");
  const [items, setItems] = useState<ReviewVocabItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/review?tab=vocab&sort=${sort}&filter=${filter}`,
        );
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        const data: { items: ReviewVocabItem[] } = await res.json();
        if (!cancelled) setItems(data.items);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sort, filter]);

  async function toggleLearned(item: ReviewVocabItem, learned: boolean) {
    // Optimistic update.
    setItems((prev) =>
      prev
        ? prev.map((v) => (v.id === item.id ? { ...v, learned } : v))
        : prev,
    );
    try {
      const res = await fetch("/api/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, learned }),
      });
      if (!res.ok) throw new Error("patch failed");
    } catch {
      // Revert on failure.
      setItems((prev) =>
        prev
          ? prev.map((v) =>
              v.id === item.id ? { ...v, learned: !learned } : v,
            )
          : prev,
      );
    }
  }

  const csvHref = `/api/review?export=csv&tab=vocab&sort=${sort}&filter=${filter}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Sort</label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as VocabSortKey)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="timesSeen">Times seen</option>
            <option value="lastSeen">Last seen</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">Filter</label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as VocabFilter)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="unlearned">Unlearned</option>
            <option value="learned">Learned</option>
          </select>
        </div>
        <a
          href={csvHref}
          className="ml-auto rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          Download CSV
        </a>
      </div>

      {error ? (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : items === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="text-center text-sm text-slate-400">
          No hay vocabulario que coincida.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Learned</th>
                <th className="px-3 py-2 font-medium">Spanish</th>
                <th className="px-3 py-2 font-medium">English</th>
                <th className="px-3 py-2 font-medium">Example</th>
                <th className="px-3 py-2 font-medium">Seen</th>
                <th className="px-3 py-2 font-medium">Source</th>
                <th className="px-3 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr
                  key={v.id}
                  className="border-t border-slate-100 align-top hover:bg-slate-50"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={v.learned}
                      onChange={(e) => void toggleLearned(v, e.target.checked)}
                      className="h-4 w-4 accent-emerald-600"
                      aria-label={`Mark ${v.spanish} as learned`}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-emerald-800">
                    {v.spanish}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{v.english}</td>
                  <td className="px-3 py-2 text-xs italic text-slate-500">
                    {v.example}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-slate-700">
                    {v.timesSeen}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {v.source}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                    {formatDate(v.lastSeen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
