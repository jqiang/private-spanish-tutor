# Phase 2 — Deploy & Secure runbook

The code for Phase 2 (cookie auth, daily turn limiter, PWA) ships in the repo.
The steps below are the **manual infra** parts that can't live in code.

## 1. Generate auth secrets

```bash
# strong random cookie-signing key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put `AUTH_PASSWORD` (your chosen password) and `AUTH_COOKIE_SECRET` (the value
above) in `.env.local` for local testing.

## 2. Turso (production DB)

```bash
# once
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create spanish-tutor
turso db show spanish-tutor --url          # -> DATABASE_URL (libsql://...)
turso db tokens create spanish-tutor       # -> TURSO_AUTH_TOKEN
```

Apply the schema to Turso (run once, and after each schema change). The Prisma
CLI reads its URL from `.env` (not `.env.local`) and doesn't carry the Turso auth
token, so the reliable way to apply migrations is the Turso shell:

```bash
turso db shell spanish-tutor < prisma/migrations/*/migration.sql
```

Verify: `turso db shell spanish-tutor ".tables"` should list
`Mistake  Session  Turn  VocabItem`.

> **Do not** put the Turso `DATABASE_URL`/`TURSO_AUTH_TOKEN` in `.env.local` —
> Next loads `.env.local` above `.env`, so local dev would hit Turso instead of
> `file:./dev.db`. Keep those two in the **Vercel** project env only (step 3).

## 3. Vercel

```bash
npx vercel link
# add each env var to Production (repeat for Preview if you want it gated too):
npx vercel env add ANTHROPIC_API_KEY production
npx vercel env add OPENAI_API_KEY production
npx vercel env add DATABASE_URL production        # the libsql:// URL
npx vercel env add TURSO_AUTH_TOKEN production
npx vercel env add AUTH_PASSWORD production
npx vercel env add AUTH_COOKIE_SECRET production
npx vercel deploy --prod
```

`/api/chat` already sets `maxDuration = 60` (Hobby ceiling).

## 4. Custom domain (required for mainland China)

`*.vercel.app` is DNS-blocked in mainland China. Attach a cheap custom domain in
the Vercel dashboard (Project → Settings → Domains) and point DNS as instructed.

## 5. Provider hard spend caps (the real safety net)

- **Anthropic Console → Billing → Usage limits** → set a monthly cap (e.g. $25).
- **OpenAI → Settings → Limits** → set a monthly **budget hard cap** (e.g. $25).

The in-app daily turn limiter (200/day, resets 00:00 UTC) is the cheap
first line; the provider caps bound worst-case spend even if the cookie leaks.
