"use client";

import { useEffect, useState } from "react";
import { MEMORY_MAX_CHARS, type LearnerProfileData } from "@/lib/memory";

function formatDateTime(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// The tutor's long-term memory of the learner: view it, edit it directly
// (fix or delete anything it got wrong), or refresh it from recent
// conversations. Mirrors the "person who remembers you" model — the memory is
// always visible and always correctable.
export default function ReviewMemory() {
  const [profile, setProfile] = useState<LearnerProfileData | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "refresh" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/memory");
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        const data: { profile: LearnerProfileData | null } = await res.json();
        if (cancelled) return;
        setProfile(data.profile);
        setDraft(data.profile?.content ?? "");
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyResult = (next: LearnerProfileData | null, message: string) => {
    setProfile(next);
    setDraft(next?.content ?? "");
    setNotice(message);
  };

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/memory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (!res.ok) throw new Error(`Save failed (${res.status}).`);
      const data: { profile: LearnerProfileData } = await res.json();
      applyResult(data.profile, "Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/memory", { method: "POST" });
      if (!res.ok) throw new Error(`Update failed (${res.status}).`);
      const data: { updated: boolean; profile: LearnerProfileData | null } =
        await res.json();
      applyResult(
        data.profile,
        data.updated
          ? "Memory updated from recent conversations."
          : "Nothing new to remember since the last update.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <p className="text-sm text-slate-400">Cargando…</p>;

  const dirty = draft !== (profile?.content ?? "");

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        What the tutor remembers about you between sessions. It updates
        automatically when you open the app; you can also refresh it now, or
        edit the text directly — your edits are what the tutor reads.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy !== null}
          className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {busy === "refresh"
            ? "Updating…"
            : "Update from recent conversations"}
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy !== null || !dirty}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy === "save" ? "Saving…" : "Save edits"}
        </button>
        {profile?.updatedAt && (
          <span className="ml-auto text-xs text-slate-400">
            Updated {formatDateTime(profile.updatedAt)}
          </span>
        )}
      </div>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </p>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={MEMORY_MAX_CHARS}
        rows={16}
        placeholder="No memory yet — have a conversation first, then update."
        aria-label="Tutor's memory of you"
        className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-sm text-slate-800 focus:border-slate-500 focus:outline-none"
      />
    </div>
  );
}
