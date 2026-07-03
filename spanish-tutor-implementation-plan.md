# Spanish Tutor Voice Chatbot — Implementation Plan

## 1. Goal

A personal web app for leisure/travel Spanish practice (**Latin American Spanish**). The user speaks (or types) in Spanish; the app replies **as a Spanish teacher**:

1. Corrects mistakes in the user's utterance (grammar, vocab, naturalness)
2. Answers any question the user asked
3. Continues the conversation in Spanish

Every assistant turn is delivered as **voice + transcript**. Additionally, the app **logs every mistake and vocabulary gap** to a local database so the user can revise later on a Review page.

## 2. Architecture

Cascaded pipeline, turn-based, **push-to-talk**:

```
Browser (Next.js)
 ├─ MediaRecorder captures mic audio (webm/opus), push-to-talk
 ├─ POST /api/stt      → OpenAI Whisper (whisper-1, language=es) → user transcript
 ├─ POST /api/chat     → Claude (claude-sonnet-4-6) with conversation history
 │                        → JSON: { corrections[], vocab_gaps[], answer, reply, reply_translation }
 │                        → server persists corrections + vocab_gaps to SQLite
 ├─ POST /api/tts      → OpenAI gpt-4o-mini-tts (Latin American Spanish voice) → mp3 stream
 └─ UI renders transcript + corrections, plays audio
Review page (/review) reads SQLite: mistakes by type/frequency, vocab list
```

Design decisions:
- **Push-to-talk** (hold/tap to record). No VAD/open-mic complexity.
- **Latin American Spanish everywhere**: prompt (ustedes, LatAm vocabulary — carro, celular, jugo), TTS voice instruction, correction norms.
- **All API keys server-side** in Next.js route handlers.
- **TTS speaks only `reply`** by default; toggle to also speak corrections.
- **Learning data captured from turn 1**: the chat route writes mistakes/vocab to DB as a side effect — no separate logging step, no lost history.
- **Streaming** (Phase 2): stream Claude's response; fire TTS when `reply` completes.

Latency budget per turn (sequential MVP): STT ~1s + Claude ~2s + TTS ~1s ≈ 3–4s.

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 14+ (App Router), TypeScript | One deployable, mobile-browser friendly |
| Styling | Tailwind | Fast prototyping |
| STT | OpenAI `whisper-1`, `language: "es"` | $0.006/min; fallback: browser Web Speech API |
| LLM | Anthropic `claude-sonnet-4-6`, structured output via tool schema | Teaching logic + corrections + vocab detection |
| TTS | OpenAI `gpt-4o-mini-tts`, instruct: "neutral Latin American Spanish, natural pace" | Alt: ElevenLabs multilingual v2 (better quality, ~10x cost) |
| DB | Turso (libSQL) via Prisma + `@prisma/adapter-libsql` | Same SQLite schema; survives Vercel's ephemeral FS; free tier. Local dev: plain SQLite file, same schema |
| Auth | Custom basic-auth middleware (`middleware.ts`) | Single password → signed httpOnly cookie; protects pages AND `/api/*` |
| Deploy | Vercel Hobby + **custom domain** | Custom domain required — `*.vercel.app` is blocked in mainland China |

Env vars (all server-side, none `NEXT_PUBLIC_`):
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_PASSWORD`, `AUTH_COOKIE_SECRET` (random 32+ bytes for HMAC).

## 4. Project structure

```
spanish-tutor/
├─ middleware.ts               # auth gate for ALL pages and /api/* (except /login, /api/login)
├─ app/
│  ├─ page.tsx                 # main chat screen
│  ├─ login/page.tsx           # password form
│  ├─ review/page.tsx          # revision: mistakes + vocabulary tabs
│  ├─ api/
│  │  ├─ login/route.ts        # verify password → set signed cookie
│  │  ├─ stt/route.ts          # audio blob → transcript
│  │  ├─ chat/route.ts         # history → teacher JSON; persists mistakes/vocab
│  │  ├─ tts/route.ts          # text → mp3 stream
│  │  └─ review/route.ts       # query mistakes/vocab; mark-learned; export
├─ components/
│  ├─ Recorder.tsx             # push-to-talk button, MediaRecorder, level meter
│  ├─ MessageList.tsx          # transcript with correction rendering
│  ├─ CorrectionCard.tsx       # original → corrected + explanation
│  ├─ VocabChip.tsx            # inline new-word highlight in replies
│  ├─ ReviewMistakes.tsx       # grouped by type, frequency, examples
│  ├─ ReviewVocab.tsx          # word list, filter, mark-as-learned
│  └─ SettingsPanel.tsx        # level, speed, voice-corrections toggle
├─ lib/
│  ├─ prompt.ts                # system prompt builder
│  ├─ types.ts                 # TeacherResponse, Correction, VocabGap
│  └─ db.ts                    # Prisma client
├─ prisma/schema.prisma
└─ .env.local
```

## 5. Core data types

```ts
interface Correction {
  original: string;        // what the user said
  corrected: string;       // natural LatAm Spanish version
  explanation: string;     // short, in English
  type: "grammar" | "vocabulary" | "naturalness" | "spelling";
}

interface VocabGap {
  spanish: string;         // the word/phrase the learner lacked
  english: string;
  example: string;         // example sentence in Spanish
  source: "asked"          // user asked "how do I say X"
        | "code-switch"    // user dropped an English word into Spanish
        | "circumlocution" // user paraphrased around a missing word
        | "introduced";    // new word appeared in teacher's reply
}

interface TeacherResponse {
  corrections: Correction[];      // empty if utterance was fine
  vocab_gaps: VocabGap[];         // max 3/turn, empty if none
  answer: string | null;          // answer to user's question (English + Spanish examples)
  reply: string;                  // conversational continuation, Spanish only
  reply_translation: string;      // English gloss, collapsible in UI
}
```

### Prisma schema (revision store)

```prisma
model Session {
  id        String   @id @default(cuid())
  startedAt DateTime @default(now())
  turns     Turn[]
}

model Turn {
  id         String   @id @default(cuid())
  sessionId  String
  session    Session  @relation(fields: [sessionId], references: [id])
  userText   String
  replyText  String
  createdAt  DateTime @default(now())
  mistakes   Mistake[]
}

model Mistake {
  id          String   @id @default(cuid())
  turnId      String
  turn        Turn     @relation(fields: [turnId], references: [id])
  original    String
  corrected   String
  explanation String
  type        String   // grammar | vocabulary | naturalness | spelling
  createdAt   DateTime @default(now())
}

model VocabItem {
  id           String   @id @default(cuid())
  spanish      String   @unique   // upsert: repeated gaps increment counter
  english      String
  example      String
  source       String
  timesSeen    Int      @default(1)
  learned      Boolean  @default(false)
  firstSeen    DateTime @default(now())
  lastSeen     DateTime @updatedAt
}
```

`timesSeen` on upsert-by-`spanish` gives a free priority signal: words you keep missing float to the top of the review list.

## 6. Teacher prompt (lib/prompt.ts)

```
You are a warm, encouraging Spanish teacher helping an adult learner
practice conversational Spanish for travel and leisure. Learner level: {level} (CEFR).
Use NEUTRAL LATIN AMERICAN SPANISH exclusively: ustedes (never vosotros),
Latin American vocabulary (carro, celular, computadora, jugo, manejar...).
Correct toward Latin American norms.

For every user message:
1. corrections: real mistakes (grammar, wrong word, unnatural phrasing).
   Max 3 per turn, prioritize what impedes communication.
   If the message was in English or mixed, gently model the Spanish version.
   Empty array if nothing to correct.
2. vocab_gaps: vocabulary the learner lacked this turn. Detect via:
   - they asked "how do I say X" → source: asked
   - they used an English word inside Spanish → source: code-switch
   - they visibly paraphrased around a missing word → source: circumlocution
   - a key word in your reply is likely new at their level → source: introduced
   Max 3 per turn, each with a practical example sentence. Empty if none.
3. answer: if the user asked a question (about Spanish, culture, travel, or the
   conversation), answer concisely in English with Spanish examples. Else null.
4. reply: continue the conversation naturally in Spanish, matched to {level}.
   Ask a follow-up question. 1–3 sentences.
5. reply_translation: English translation of reply.

Topics to favor: travel, food, daily life, culture. Practical vocabulary.
Respond ONLY via the provided JSON tool schema.
```

Use Anthropic structured output (tool-use with `TeacherResponse` JSON schema) — no parse failures.

Conversation history: last ~20 turns as plain `role/text` messages (strip metadata to save tokens).

## 7. API routes

### POST /api/stt
- Input: `FormData` with audio blob (webm/opus)
- OpenAI `audio.transcriptions.create({ model: "whisper-1", language: "es" })`
  - Test without forced `language` too — user may ask questions in English mid-session
- Output: `{ transcript: string }`

### POST /api/chat
- Input: `{ sessionId, messages: {role, text}[], level }`
- Call Claude with system prompt + tool schema → `TeacherResponse`
- **Persist**: create `Turn`, insert `Mistake[]`, upsert `VocabItem[]` (increment `timesSeen`, refresh `lastSeen`)
- Output: `TeacherResponse`

### POST /api/tts
- Input: `{ text, speed? }`
- OpenAI TTS with LatAm Spanish voice instruction, stream mp3 (`audio/mpeg`)
- Client plays via blob URL; keep URL on message for replay

### GET/PATCH /api/review
- GET: `?tab=mistakes` (grouped by type, sorted by frequency/recency) or `?tab=vocab` (filter learned/unlearned, sort by timesSeen)
- PATCH: mark vocab item learned/unlearned
- GET `?export=csv`: dump vocab or mistakes as CSV

## 8. UI behavior

**Chat page**
- Push-to-talk: press-and-hold (desktop: spacebar) → record → release → pipeline. States: recording / transcribing / thinking / speaking.
- Text input fallback.
- Assistant turn rendering:
  1. Correction cards (amber): ~~original~~ → **corrected**, one-line explanation
  2. Vocab chips (green): new words from `vocab_gaps`, tap to see example sentence
  3. Answer block (blue), only if present
  4. Spanish reply (primary) + collapsible English translation + replay button
- Settings: CEFR level (A1–B2), TTS speed (0.8–1.2), speak-corrections toggle, new session.

**Review page** (`/review`)
- **Mistakes tab**: grouped by type; each group sorted by frequency; expandable to see original → corrected + explanation + date. "Common patterns" surface repeat offenders.
- **Vocabulary tab**: table of words (spanish, english, example, timesSeen, source), sort by timesSeen/lastSeen, filter learned/unlearned, mark-as-learned checkbox, CSV export (for Anki import later).

## 9. Deployment, access control & API cost protection

### 9.1 Auth: single-password middleware

**`middleware.ts`** runs on every request except `/login`, `/api/login`, `_next` static assets:

```ts
export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
```

Logic:
- Read `auth` cookie → verify HMAC-SHA256 signature against `AUTH_COOKIE_SECRET` (Web Crypto — middleware runs on Edge runtime, no Node `crypto`)
- Valid → pass through
- Invalid/missing → **pages**: redirect `/login`; **`/api/*`**: return `401` JSON (no redirect)

**`/api/login`**:
- POST `{ password }` → **timing-safe compare** against `AUTH_PASSWORD`
- Success → set cookie: `httpOnly; Secure; SameSite=Lax; Path=/; Max-Age=90d`, value = `expiry.hmac(expiry, secret)`
- Add a small in-memory delay/attempt counter on failures (basic brute-force friction)

This one gate covers both the UI **and every expensive API route** — nobody without the cookie can trigger STT/LLM/TTS calls on your keys.

### 9.2 API key exposure — defense in depth

1. **Keys only in route handlers** (server). Never `NEXT_PUBLIC_*`, never in client bundle, never sent to browser.
2. **Middleware 401s unauthenticated `/api/*`** — verify with `curl -X POST https://yourdomain/api/chat` (expect 401) after deploy.
3. **Hard spend caps at the provider** (the real safety net):
   - Anthropic Console → Billing → set monthly spend limit (e.g. $25)
   - OpenAI → Limits → set monthly **budget hard cap** (e.g. $25)
4. **App-level kill switch**: daily turn counter in DB; `/api/chat` returns 429 past N turns/day (e.g. 200). Cheap insurance if the cookie ever leaks.
5. `.env.local` in `.gitignore`; keys entered only in Vercel project env settings.

### 9.3 Vercel + Turso setup

- Turso: create DB → `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`; Prisma client via `@prisma/adapter-libsql`. Local dev keeps `file:./dev.db`.
- Vercel Hobby: import repo, set env vars, deploy.
- **Attach custom domain** (any cheap domain) — required for China access since `*.vercel.app` is DNS-blocked there. Note: custom domain usually works from mainland China but isn't guaranteed; fallback is a VPS if it becomes a problem.
- Route handler note: set `export const maxDuration = 60` on `/api/chat` (Hobby allows up to 60s for streaming responses).
- Phone: open domain → Add to Home Screen → standalone app feel. Add minimal PWA manifest + icons.

## 10. Build phases

### Phase 1 — MVP (local)
1. Scaffold Next.js + Tailwind + Prisma/SQLite (schema above), env setup
2. `/api/chat` with structured output + **text-only chat UI** → iterate on teacher prompt quality first (cheapest loop); persistence wired in from the start
3. `/api/stt` + push-to-talk Recorder
4. `/api/tts` + auto-play on assistant reply
5. Correction cards + vocab chips + translation toggle

### Phase 2 — Deploy & secure
6. `middleware.ts` + `/login` + `/api/login` (spec §9.1); test 401 on API routes
7. Turso migration (adapter-libsql), Vercel deploy, custom domain, env vars
8. Provider spend caps + daily turn limiter (§9.2)
9. PWA manifest + Add-to-Home-Screen check on phone

### Phase 3 — Revision & polish
10. `/review` page: mistakes + vocabulary tabs, mark-learned, CSV export
11. Streaming Claude response; fire TTS on `reply` completion
12. Settings panel (level, speed, speak-corrections)
13. Error handling: mic permission, API failures, empty recordings
14. Mobile layout pass

### Phase 4 — Optional learning features
15. Spaced-repetition-lite: daily "review 10 words" flashcard mode from VocabItem
16. Scenario mode: preset roleplays (restaurant, hotel check-in, taxi, pharmacy)
17. Session summary: end-of-session recap of mistakes + new vocab
18. Weekly digest: trend of mistake types over time (are grammar errors declining?)

## 11. Cost estimate (daily 30-min practice)

- Whisper ~$0.09 + Claude Sonnet ~$0.30–0.50 + TTS ~$0.10 ≈ **$0.50–0.70/day**
- Hosting: Vercel Hobby $0, Turso free tier $0, custom domain ~$10–15/yr
- Provider hard caps ($25/mo each) bound worst-case exposure even if auth is bypassed

## 12. Locked decisions

- ✅ **Push-to-talk** (no open-mic/VAD)
- ✅ **Latin American Spanish** default — prompt, corrections, TTS voice
- ✅ **Mistake log + vocabulary gap tracking** persisted from turn 1, revisable at `/review`
- ✅ **Vercel Hobby + custom domain + Turso**, single-password cookie auth covering pages and all API routes
- ✅ **Spend caps** at Anthropic + OpenAI consoles, plus app-level daily turn limit

## 13. Remaining defaults (override if wanted)

- Correction strictness: max 3/turn — tune after real use
- Vocab dedupe is exact-match on `spanish` string; lemma-level dedupe (comí/comer) left for later
- Daily turn limit default 200; cookie lifetime 90 days
