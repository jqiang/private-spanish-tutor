"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AssistantTurn from "@/components/AssistantTurn";
import Recorder from "@/components/Recorder";
import SettingsPanel from "@/components/SettingsPanel";
import {
  classifyError,
  classifyHttpStatus,
  toUserMessage,
} from "@/lib/errors";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  type Settings,
} from "@/lib/settings";
import { parseSseLine } from "@/lib/stream";
import type { ChatMessage, TeacherResponse } from "@/lib/types";

type ChatResponse = TeacherResponse & { sessionId?: string };

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Keep the latest settings readable inside async stream loops without
  // re-creating the callbacks (avoids stale closures on speed/level/toggles).
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Load persisted settings on mount.
  useEffect(() => {
    setSettings(loadSettings(window.localStorage));
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(window.localStorage, next);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  // Speak text via the TTS route. Best-effort — the transcript is already shown.
  const playReply = useCallback(async (text: string) => {
    if (!text) return;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, speed: settingsRef.current.ttsSpeed }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.onended = () => URL.revokeObjectURL(url);
        await audioRef.current.play().catch(() => {});
      }
    } catch {
      // ignore playback failures
    }
  }, []);

  // Decide what to speak once a turn is complete: the reply, optionally prefixed
  // by the corrected phrases when "speak corrections" is on.
  const speakTeacher = useCallback(
    (teacher: TeacherResponse) => {
      const s = settingsRef.current;
      if (!s.speak) return;
      let text = teacher.reply;
      if (s.speakCorrections && teacher.corrections?.length) {
        const fixes = teacher.corrections
          .map((c) => c.corrected)
          .filter(Boolean)
          .join(". ");
        if (fixes) text = `${fixes}. ${teacher.reply}`;
      }
      void playReply(text);
    },
    [playReply],
  );

  // Replace the trailing assistant placeholder in-place.
  const setLastAssistant = useCallback(
    (patch: Partial<ChatMessage>) => {
      setMessages((prev) => {
        const next = [...prev];
        const i = next.length - 1;
        if (i >= 0 && next[i].role === "assistant") {
          next[i] = { ...next[i], ...patch };
        }
        return next;
      });
    },
    [],
  );

  // Drop the empty placeholder and surface a friendly error.
  const failTurn = useCallback((message: string) => {
    setMessages((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last && last.role === "assistant" && !last.teacher) next.pop();
      return next;
    });
    setError(message);
  }, []);

  const finishTurn = useCallback(
    (teacher: TeacherResponse, sid?: string) => {
      setLastAssistant({ text: teacher.reply, teacher });
      if (sid) setSessionId(sid);
      speakTeacher(teacher);
    },
    [setLastAssistant, speakTeacher],
  );

  // Non-streaming fallback used when the SSE path errors mid-flight.
  const runFallback = useCallback(
    async (wireMessages: { role: string; text: string }[]) => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            level: settingsRef.current.level,
            messages: wireMessages,
          }),
        });
        if (!res.ok) {
          failTurn(toUserMessage(classifyHttpStatus(res.status)));
          return;
        }
        const data: ChatResponse = await res.json();
        finishTurn(data, data.sessionId);
      } catch (err) {
        failTurn(toUserMessage(classifyError(err)));
      }
    },
    [sessionId, failTurn, finishTurn],
  );

  const runTurn = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const wireMessages = [...messages, { role: "user", text: trimmed }].map(
        (m) => ({ role: m.role, text: m.text }),
      );

      setMessages([
        ...messages,
        { role: "user", text: trimmed },
        { role: "assistant", text: "" },
      ]);
      setInput("");
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            level: settingsRef.current.level,
            messages: wireMessages,
            stream: true,
          }),
        });

        // Hard failures (rate-limit, auth, server) come back as JSON, not SSE —
        // don't fall back, just classify the status.
        if (!res.ok) {
          failTurn(toUserMessage(classifyHttpStatus(res.status)));
          return;
        }
        if (!res.body) throw new Error("Missing response body.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let teacher: TeacherResponse | null = null;
        let sid: string | undefined;
        let streamDone = false;

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            const ev = parseSseLine(line);
            if (!ev) continue;

            if (ev.type === "delta") {
              setLastAssistant({ text: ev.reply });
            } else if (ev.type === "done") {
              teacher = ev.teacher;
              sid = ev.sessionId;
              streamDone = true;
              break;
            } else if (ev.type === "error") {
              throw new Error(ev.error);
            }
          }
        }

        if (!teacher) throw new Error("Stream ended before completion.");
        finishTurn(teacher, sid);
      } catch {
        // Graceful fallback: retry once without streaming.
        await runFallback(wireMessages);
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, sessionId, setLastAssistant, failTurn, finishTurn, runFallback],
  );

  const newSession = useCallback(() => {
    setMessages([]);
    setSessionId(undefined);
    setError(null);
  }, []);

  const lastMsg = messages[messages.length - 1];
  const awaitingFirstToken =
    loading &&
    lastMsg?.role === "assistant" &&
    !lastMsg.text &&
    !lastMsg.teacher;

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-50">
      <audio ref={audioRef} hidden />

      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="min-w-0 text-lg font-semibold text-slate-800">
          Spanish Tutor
          <span className="ml-2 hidden text-xs font-normal text-slate-400 sm:inline">
            Latin American
          </span>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/review"
            className="flex h-9 items-center gap-1.5 rounded-full border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-100"
            title="Review mistakes and vocabulary"
          >
            <span aria-hidden>📖</span>
            <span className="hidden sm:inline">Review</span>
          </Link>
          <SettingsPanel
            settings={settings}
            onChange={updateSettings}
            onNewSession={newSession}
          />
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {messages.length === 0 && (
            <p className="text-center text-sm text-slate-400">
              Habla o escribe en español para empezar. ¿Qué hiciste hoy?
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] break-words rounded-2xl bg-slate-800 px-4 py-2 text-white">
                  {m.text}
                </div>
              </div>
            ) : m.teacher ? (
              <div key={i} className="max-w-full">
                <AssistantTurn t={m.teacher} />
              </div>
            ) : m.text ? (
              <div key={i} className="max-w-full">
                <p className="whitespace-pre-wrap break-words text-slate-900">
                  {m.text}
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-slate-400 align-middle" />
                </p>
              </div>
            ) : null,
          )}
          {awaitingFirstToken && (
            <p className="text-sm text-slate-400">El profesor está pensando…</p>
          )}
          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-center">
          <Recorder
            disabled={loading}
            onTranscript={(t) => void runTurn(t)}
            onError={setError}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runTurn(input);
            }}
            className="flex min-w-0 flex-1 gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe en español…"
              className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2 focus:border-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-11 shrink-0 rounded-full bg-slate-800 px-5 font-medium text-white disabled:opacity-40"
            >
              Enviar
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
