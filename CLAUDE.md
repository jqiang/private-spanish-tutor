@AGENTS.md

# CLAUDE.md — Spanish Tutor

A personal web app for practicing **Latin American Spanish** (travel/leisure). The
user speaks or types in Spanish; the app replies as a Spanish teacher: corrects
mistakes, answers questions, and continues the conversation — delivered as voice +
transcript. Every mistake and vocabulary gap is logged to a local DB for later
revision at `/review`.

The full spec lives in [spanish-tutor-implementation-plan.md](spanish-tutor-implementation-plan.md).
Read it before making architectural changes.

## Stack (as built)

- **Next.js 16** (App Router, Turbopack), TypeScript, **Tailwind v4** (CSS-config, no `tailwind.config.js`).
- **Prisma 7** with the **libSQL driver adapter** (`@prisma/adapter-libsql`). Local dev
  uses a SQLite file (`file:./dev.db`); Phase 2 swaps `DATABASE_URL` to Turso — same code path.
  - The generated client is emitted to `app/generated/prisma/` (gitignored). Import via `@/lib/db`.
  - Datasource URL is configured in `prisma.config.ts` (loads `.env` via `dotenv`), NOT in `schema.prisma`.
- **Anthropic** `claude-sonnet-4-6` for the teacher. Structured output is done via
  **forced tool-use** (`tool_choice` on the `record_teacher_response` tool in `lib/teacherTool.ts`),
  not `output_config.format` (which Sonnet 4.6 doesn't support). Sonnet 4.6 is the plan's
  deliberate cost choice — keep it unless the user asks otherwise.
- **OpenAI** Whisper (STT) + `gpt-4o-mini-tts` (TTS) — Phase 1 steps 3–4.

> Note: this is Next 16 (Middleware is now "Proxy" / `proxy.ts`; route `params` are async).
> When unsure of a convention, check `node_modules/next/dist/docs/` before writing.

## Commands

```bash
npm run dev            # dev server (http://localhost:3000)
npm run build          # production build + full typecheck (use this to typecheck)
npm run lint

# Prisma
npx prisma generate            # regenerate client after schema changes
npx prisma migrate dev --name <name>   # create + apply a migration
npx prisma studio              # inspect the local DB
```

## Environment

Secrets are server-side only — never `NEXT_PUBLIC_*`. See `.env.example`.
- `.env` holds `DATABASE_URL` (Prisma CLI reads it via `prisma.config.ts`).
- `.env.local` holds `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (Next reads both files at runtime).
- **You must add real keys to `.env.local`** — `/api/chat` returns a 500 guard until `ANTHROPIC_API_KEY` is set.

## Layout

```
app/
  page.tsx              # main chat screen (client component)
  api/chat/route.ts     # history -> teacher JSON (forced tool-use); persists mistakes/vocab
  generated/prisma/     # generated Prisma client (gitignored)
components/
  AssistantTurn.tsx     # renders corrections + vocab + answer + reply w/ translation toggle
  CorrectionCard.tsx    # amber card: original -> corrected + explanation
  VocabChip.tsx         # green chip, tap to reveal example
lib/
  db.ts                 # Prisma client singleton (libSQL adapter)
  types.ts              # Correction, VocabGap, TeacherResponse, ChatMessage
  prompt.ts             # system prompt builder (LatAm Spanish)
  teacherTool.ts        # the record_teacher_response tool schema
prisma/schema.prisma
```

## Build phases (from the plan)

- **Phase 1 — MVP (local):** ✅ scaffold + Prisma + `/api/chat` + text chat UI + correction/vocab/translation
  rendering + `/api/stt` + push-to-talk Recorder + `/api/tts` + auto-play.
- **Phase 2 — Deploy & secure:** ✅ `proxy.ts` password auth (`/login`, `/api/login`), daily turn limiter (429),
  PWA manifest + icons, Turso schema applied. TDD'd with Vitest (`npm test`).
  ⏳ manual infra (see [DEPLOY.md](DEPLOY.md)): Vercel env vars + deploy, custom domain, provider spend caps.
- **Phase 3 — Revision & polish:** `/review` page, streaming, settings panel, error handling, mobile.
- **Phase 4 — Optional:** spaced-repetition, scenario mode, session summary, weekly digest.

## Conventions

- All API keys stay in route handlers (server). `/api/*` runs on the Node runtime (`runtime = "nodejs"`) — Prisma/libSQL need it.
- The chat route persists `Turn` + `Mistake[]` + upserts `VocabItem[]` as a side effect; DB errors never block the reply.
- `VocabItem.timesSeen` increments on repeat gaps (upsert by `spanish`) — a free priority signal for the review list.
