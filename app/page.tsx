"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AssistantTurn from "@/components/AssistantTurn";
import Recorder from "@/components/Recorder";
import type { CefrLevel, ChatMessage, TeacherResponse } from "@/lib/types";

const LEVELS: CefrLevel[] = ["A1", "A2", "B1", "B2"];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [level, setLevel] = useState<CefrLevel>("A2");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speak, setSpeak] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  const playReply = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return; // TTS is best-effort; the transcript is already shown
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

  const runTurn = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", text: trimmed },
      ];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            level,
            messages: nextMessages.map((m) => ({ role: m.role, text: m.text })),
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `Request failed (${res.status}).`);
        }
        const data: TeacherResponse & { sessionId: string } = await res.json();
        setSessionId(data.sessionId);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.reply, teacher: data },
        ]);
        if (speak && data.reply) void playReply(data.reply);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, sessionId, level, speak, playReply],
  );

  function newSession() {
    setMessages([]);
    setSessionId(undefined);
    setError(null);
  }

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <audio ref={audioRef} hidden />

      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-slate-800">
          Spanish Tutor
          <span className="ml-2 text-xs font-normal text-slate-400">
            Latin American
          </span>
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-slate-500">Level</label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as CefrLevel)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSpeak((s) => !s)}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
            title="Toggle spoken replies"
          >
            {speak ? "🔊" : "🔇"}
          </button>
          <button
            type="button"
            onClick={newSession}
            className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            New session
          </button>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          {messages.length === 0 && (
            <p className="text-center text-sm text-slate-400">
              Habla o escribe en español para empezar. ¿Qué hiciste hoy?
            </p>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-slate-800 px-4 py-2 text-white">
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={i} className="max-w-[90%]">
                {m.teacher ? (
                  <AssistantTurn t={m.teacher} />
                ) : (
                  <p className="text-slate-900">{m.text}</p>
                )}
              </div>
            ),
          )}
          {loading && (
            <p className="text-sm text-slate-400">El profesor está pensando…</p>
          )}
          {error && (
            <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
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
            className="flex flex-1 gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe en español…"
              className="flex-1 rounded-full border border-slate-300 px-4 py-2 focus:border-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-full bg-slate-800 px-5 py-2 font-medium text-white disabled:opacity-40"
            >
              Enviar
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}
