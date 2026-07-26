// Learner memory endpoint.
//   GET  -> the current profile (null if never written)
//   POST -> consolidate: fold turns newer than `coveredUntil` into the profile
//           via a Claude merge call. No new turns = no API call (cheap no-op),
//           so the client can fire this on every app open.
//   PUT  -> save a manually edited profile verbatim (the /review Memory tab).

import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/db";
import {
  MEMORY_MAX_CHARS,
  MEMORY_MAX_TOKENS,
  MEMORY_MAX_TURNS,
  MEMORY_MODEL,
  MEMORY_SYSTEM_PROMPT,
  PROFILE_ID,
  buildMemoryPrompt,
  clampProfileContent,
  latestTurnDate,
} from "@/lib/memory";

export const runtime = "nodejs";
export const maxDuration = 60;

function getProfile() {
  return prisma.learnerProfile.findUnique({ where: { id: PROFILE_ID } });
}

export async function GET() {
  try {
    return Response.json({ profile: await getProfile() });
  } catch (err) {
    console.error("Memory read failed:", err);
    return Response.json({ error: "Failed to load memory." }, { status: 500 });
  }
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  try {
    const profile = await getProfile();

    // Newest first so the cap keeps the most recent turns, then restore
    // chronological order for the prompt.
    const turns = (
      await prisma.turn.findMany({
        where: profile?.coveredUntil
          ? { createdAt: { gt: profile.coveredUntil } }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: MEMORY_MAX_TURNS,
      })
    ).reverse();

    if (turns.length === 0) {
      return Response.json({ updated: false, profile });
    }

    const client = new Anthropic();
    const response = await client.messages.create({
      model: MEMORY_MODEL,
      max_tokens: MEMORY_MAX_TOKENS,
      system: MEMORY_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildMemoryPrompt(profile?.content ?? "", turns) },
      ],
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    const content = clampProfileContent(text);
    if (!content) {
      return Response.json(
        { error: "Model returned an empty memory." },
        { status: 502 },
      );
    }

    const coveredUntil = latestTurnDate(turns);
    const saved = await prisma.learnerProfile.upsert({
      where: { id: PROFILE_ID },
      update: { content, coveredUntil },
      create: { id: PROFILE_ID, content, coveredUntil },
    });

    return Response.json({ updated: true, profile: saved });
  } catch (err) {
    console.error("Memory consolidation failed:", err);
    return Response.json(
      { error: "Failed to update memory." },
      { status: 502 },
    );
  }
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { content } = (body ?? {}) as { content?: unknown };
  if (typeof content !== "string") {
    return Response.json(
      { error: "`content` (string) is required." },
      { status: 400 },
    );
  }
  if (content.length > MEMORY_MAX_CHARS) {
    return Response.json(
      { error: `\`content\` must be at most ${MEMORY_MAX_CHARS} characters.` },
      { status: 400 },
    );
  }

  try {
    const saved = await prisma.learnerProfile.upsert({
      where: { id: PROFILE_ID },
      update: { content: content.trim() },
      create: { id: PROFILE_ID, content: content.trim() },
    });
    return Response.json({ profile: saved });
  } catch (err) {
    console.error("Memory save failed:", err);
    return Response.json({ error: "Failed to save memory." }, { status: 500 });
  }
}
