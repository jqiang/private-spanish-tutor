import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

// Common Whisper hallucinations on silent/non-speech Spanish audio.
const HALLUCINATION_MARKERS = [
  "amara.org",
  "subtítulos realizados por",
  "subtítulos por la comunidad",
  "gracias por ver el video",
  "¡gracias por ver el video!",
];

function isHallucination(text: string): boolean {
  const t = text.toLowerCase();
  return HALLUCINATION_MARKERS.some((m) => t.includes(m));
}

// Audio blob (webm/opus) -> Spanish transcript via Whisper.
export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json(
      { error: "No audio file provided." },
      { status: 400 },
    );
  }

  const client = new OpenAI();
  try {
    const result = await client.audio.transcriptions.create({
      file: audio,
      model: "whisper-1",
      language: "es", // Latin American Spanish practice; user may occasionally ask in English
      temperature: 0,
    });
    const text = result.text.trim();
    // Whisper hallucinates stock subtitle credits on silent/near-silent audio.
    // Drop those so they don't surface as the user's utterance.
    if (isHallucination(text)) {
      return Response.json({ transcript: "" });
    }
    return Response.json({ transcript: text });
  } catch (err) {
    console.error("STT failed:", err);
    return Response.json({ error: "Transcription failed." }, { status: 502 });
  }
}
