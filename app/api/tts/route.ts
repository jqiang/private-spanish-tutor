import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 30;

interface TtsRequest {
  text: string;
  speed?: number; // reserved; gpt-4o-mini-tts steers pace via instructions
}

// Text -> spoken Latin American Spanish (mp3 stream).
export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let body: TtsRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return Response.json({ error: "`text` is required." }, { status: 400 });
  }

  const client = new OpenAI();
  try {
    const speech = await client.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
      instructions:
        "Speak in neutral Latin American Spanish with a warm, encouraging tone and a natural, unhurried pace, as a friendly language teacher.",
      response_format: "mp3",
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    return new Response(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("TTS failed:", err);
    return Response.json({ error: "Speech synthesis failed." }, { status: 502 });
  }
}
