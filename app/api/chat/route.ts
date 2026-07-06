import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/db";
import { buildSystemPrompt } from "@/lib/prompt";
import { checkDailyLimit } from "@/lib/rateLimit";
import {
  createTeacherAccumulator,
  encodeSseEvent,
} from "@/lib/stream";
import { teacherTool, TEACHER_TOOL_NAME } from "@/lib/teacherTool";
import type { CefrLevel, ChatTurn, TeacherResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

interface ChatRequest {
  sessionId?: string;
  messages: ChatTurn[];
  level?: CefrLevel;
  stream?: boolean;
}

// Persist learning data as a side effect and resolve the session id. Never
// throws — DB errors must not block the reply. Returns the (possibly newly
// created) session id, or the incoming one if persistence failed.
async function persistTurn(
  incomingSessionId: string | undefined,
  userText: string,
  teacher: TeacherResponse,
): Promise<string | undefined> {
  let sessionId = incomingSessionId;
  try {
    if (sessionId) {
      await prisma.session.upsert({
        where: { id: sessionId },
        update: {},
        create: { id: sessionId },
      });
    } else {
      const session = await prisma.session.create({ data: {} });
      sessionId = session.id;
    }

    const turn = await prisma.turn.create({
      data: {
        sessionId,
        userText,
        replyText: teacher.reply ?? "",
      },
    });

    if (teacher.corrections?.length) {
      await prisma.mistake.createMany({
        data: teacher.corrections.map((c) => ({
          turnId: turn.id,
          original: c.original,
          corrected: c.corrected,
          explanation: c.explanation,
          type: c.type,
        })),
      });
    }

    for (const gap of teacher.vocab_gaps ?? []) {
      await prisma.vocabItem.upsert({
        where: { spanish: gap.spanish },
        update: { timesSeen: { increment: 1 }, lastSeen: new Date() },
        create: {
          spanish: gap.spanish,
          english: gap.english,
          example: gap.example,
          source: gap.source,
        },
      });
    }
  } catch (err) {
    console.error("Persistence failed (continuing):", err);
  }
  return sessionId;
}

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 },
    );
  }

  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, level = "A2" } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json(
      { error: "`messages` must be a non-empty array." },
      { status: 400 },
    );
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return Response.json(
      { error: "No user message found." },
      { status: 400 },
    );
  }

  // App-level kill switch: cap turns/day even if the auth cookie leaks (§9.2.4).
  // Best-effort — a counting failure must not take the tutor down.
  try {
    const { exceeded } = await checkDailyLimit(prisma);
    if (exceeded) {
      return Response.json(
        { error: "Daily practice limit reached. Come back tomorrow." },
        { status: 429 },
      );
    }
  } catch (err) {
    console.error("Daily limit check failed (continuing):", err);
  }

  // Keep only the last ~20 turns to bound token usage.
  const history = messages.slice(-20).map((m) => ({
    role: m.role,
    content: m.text,
  }));

  const client = new Anthropic();

  const anthropicArgs = {
    model: MODEL,
    max_tokens: 2000,
    system: buildSystemPrompt(level),
    tools: [teacherTool],
    tool_choice: { type: "tool" as const, name: TEACHER_TOOL_NAME },
    messages: history,
  };

  // --- Streaming path -----------------------------------------------------
  // Relay the tool's input_json_delta fragments as SSE `delta` events (running
  // reply), persist exactly as the JSON path does, then emit a final `done`.
  if (body.stream) {
    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const acc = createTeacherAccumulator();
        try {
          const anthropicStream = client.messages.stream(anthropicArgs);
          for await (const event of anthropicStream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "input_json_delta"
            ) {
              const { reply } = acc.push(event.delta.partial_json);
              controller.enqueue(
                encoder.encode(encodeSseEvent({ type: "delta", reply })),
              );
            }
          }

          const teacher = acc.final();
          const sessionId = await persistTurn(
            body.sessionId,
            lastUser.text,
            teacher,
          );
          controller.enqueue(
            encoder.encode(
              encodeSseEvent({ type: "done", teacher, sessionId }),
            ),
          );
        } catch (err) {
          console.error("Streaming chat failed:", err);
          controller.enqueue(
            encoder.encode(
              encodeSseEvent({
                type: "error",
                error: "Failed to get a response from the tutor.",
              }),
            ),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // --- Non-streaming path (unchanged behaviour) ---------------------------
  let teacher: TeacherResponse;
  try {
    const response = await client.messages.create(anthropicArgs);

    const toolUse = response.content.find(
      (block) => block.type === "tool_use" && block.name === TEACHER_TOOL_NAME,
    );
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json(
        { error: "Model did not return a teacher response." },
        { status: 502 },
      );
    }
    teacher = toolUse.input as TeacherResponse;
  } catch (err) {
    console.error("Claude request failed:", err);
    return Response.json(
      { error: "Failed to get a response from the tutor." },
      { status: 502 },
    );
  }

  // Persist learning data as a side effect. Never block the reply on DB errors.
  const sessionId = await persistTurn(body.sessionId, lastUser.text, teacher);

  return Response.json({ ...teacher, sessionId });
}
