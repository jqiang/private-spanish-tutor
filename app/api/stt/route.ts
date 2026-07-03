import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

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
    });
    return Response.json({ transcript: result.text.trim() });
  } catch (err) {
    console.error("STT failed:", err);
    return Response.json({ error: "Transcription failed." }, { status: 502 });
  }
}
