"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecState = "idle" | "recording" | "transcribing";

// Push-to-talk: hold the button (or the spacebar) to record, release to transcribe.
export default function Recorder({
  disabled,
  onTranscript,
  onError,
}: {
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState<RecState>("idle");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stateRef = useRef<RecState>("idle");
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (disabled || stateRef.current !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stopTracks();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const form = new FormData();
          form.append("audio", blob, "speech.webm");
          const res = await fetch("/api/stt", { method: "POST", body: form });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? `STT failed (${res.status}).`);
          }
          const { transcript } = await res.json();
          if (transcript) onTranscript(transcript);
          else onError("No speech detected. Try again.");
        } catch (err) {
          onError(err instanceof Error ? err.message : "Transcription failed.");
        } finally {
          setState("idle");
        }
      };
      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
    } catch {
      onError("Microphone access denied or unavailable.");
      stopTracks();
      setState("idle");
    }
  }, [disabled, onError, onTranscript, stopTracks]);

  const stop = useCallback(() => {
    if (stateRef.current !== "recording") return;
    recorderRef.current?.stop();
  }, []);

  // Spacebar push-to-talk (ignore when typing in the text input).
  useEffect(() => {
    const isTyping = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT");

    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.repeat && !isTyping(e.target)) {
        e.preventDefault();
        start();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      stopTracks();
    };
  }, [start, stop, stopTracks]);

  const label =
    state === "recording"
      ? "Grabando… suelta para enviar"
      : state === "transcribing"
        ? "Transcribiendo…"
        : "Mantén para hablar";

  return (
    <button
      type="button"
      disabled={disabled || state === "transcribing"}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      className={`select-none rounded-full px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40 ${
        state === "recording"
          ? "bg-red-600"
          : "bg-emerald-600 hover:bg-emerald-700"
      }`}
      title="Hold to talk (or hold the spacebar)"
    >
      🎤 {label}
    </button>
  );
}
