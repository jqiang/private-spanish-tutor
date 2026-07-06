"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyError,
  classifyHttpStatus,
  isEmptyRecording,
  toUserMessage,
} from "@/lib/errors";

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
  // True while the button/spacebar is held. Guards the getUserMedia race:
  // if the user releases before the mic is ready, we don't record silence.
  const holdingRef = useRef(false);

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

      // Released during mic warm-up → abort instead of recording silence.
      if (!holdingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

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
        // A real utterance is tens of KB; Opus compresses silence to ~1–2KB.
        if (isEmptyRecording(blob) || blob.size < 4000) {
          setState("idle");
          onError(toUserMessage("empty-recording"));
          return;
        }
        setState("transcribing");
        try {
          const form = new FormData();
          form.append("audio", blob, "speech.webm");
          const res = await fetch("/api/stt", { method: "POST", body: form });
          if (!res.ok) {
            onError(toUserMessage(classifyHttpStatus(res.status)));
            return;
          }
          const { transcript } = await res.json();
          if (transcript) onTranscript(transcript);
          else onError(toUserMessage("empty-recording"));
        } catch (err) {
          onError(toUserMessage(classifyError(err)));
        } finally {
          setState("idle");
        }
      };
      // Timeslice so audio flushes in chunks (more robust than a single
      // blob delivered only on stop, especially for short recordings).
      recorder.start(250);
      recorderRef.current = recorder;
      setState("recording");
    } catch (err) {
      onError(toUserMessage(classifyError(err)));
      stopTracks();
      setState("idle");
    }
  }, [disabled, onError, onTranscript, stopTracks]);

  const stop = useCallback(() => {
    if (stateRef.current === "recording") recorderRef.current?.stop();
  }, []);

  const begin = useCallback(() => {
    holdingRef.current = true;
    void start();
  }, [start]);

  const end = useCallback(() => {
    holdingRef.current = false;
    stop();
  }, [stop]);

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
        begin();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTyping(e.target)) {
        e.preventDefault();
        end();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      stopTracks();
    };
  }, [begin, end, stopTracks]);

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
      onPointerDown={begin}
      onPointerUp={end}
      onPointerLeave={end}
      className={`w-full shrink-0 select-none rounded-full px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-40 sm:w-auto ${
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
