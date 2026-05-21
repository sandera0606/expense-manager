# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## This is NOT the Next.js you know

This project uses **Next.js 16** (with React 19). APIs, conventions, and file structure differ from older Next versions and from most training data. Before writing any code that touches the framework, read the relevant guide under `node_modules/next/dist/docs/`. Heed deprecation notices.

Concrete footguns that already bit this codebase:

- **`middleware.ts` was renamed to `proxy.ts`** — see `proxy.ts` at the repo root. Same purpose (runs on every request to refresh the Supabase session cookie), new filename.
- **`cookies()`, `params`, `searchParams` are async** — must be awaited. See `lib/supabase/server.ts`.
- **Cache Components is enabled** (`next.config.ts` → `cacheComponents: true`). Any uncached data fetch must be inside a `<Suspense>` boundary, or it will fail to prerender. See `app/(app)/layout.tsx` for the pattern (static shell + streamed `<UserChip>` that calls `verifySession`).

## Commands

```bash
pnpm dev           # next dev — local dev server
pnpm dev:https     # next dev --experimental-https -H 0.0.0.0 — LAN-accessible HTTPS, needed for phone testing (camera APIs require https)
pnpm build         # next build
pnpm start         # production server
pnpm lint          # eslint
```

There is no test suite yet. The package manager is **pnpm** (see `pnpm-lock.yaml`, `pnpm-workspace.yaml`).

`next.config.ts` whitelists `192.168.*.*`, `10.*.*.*`, and `*.local` as dev origins so a phone on the same LAN can hit `dev:https`. If you change LAN ranges, update there.

## Environment

`.env.local` (template in `.env.example`):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser-safe.
- `SUPABASE_SERVICE_ROLE_KEY` — server only; used by `lib/supabase/admin.ts` for pairing-code consume (which must run unauthenticated).
- `ANTHROPIC_API_KEY` — **leave blank in local dev**. The AI layer (`lib/ai/providers/anthropic.ts`) then routes through `@anthropic-ai/claude-agent-sdk`, which spawns the user's logged-in `claude` CLI. Requires `claude login` on the dev machine. Setting the key switches to the direct-API path (not yet implemented; needed for Vercel since no CLI binary exists on serverless).

## Architecture

This is an **AI-native bookkeeping platform**. Two ideas drive the design:

1. **Canonical data, adaptive presentation.** Transactions live in a clean, boring Postgres schema. The UI is generated from a **Layout JSON** spec that the user (via Claude) can mutate. "Move the chart to the top" / "show me a kids-spending view" → AI edits the Layout JSON → renderer re-renders. The data does not move; only the lens does.
2. **VLM-first ingestion.** Photos of receipts, PDF statements, screenshots all flow through Claude (Sonnet) for extraction → normalized into the canonical schema.

### Key boundaries

- **Canonical types** (`types/canonical.ts`) mirror `lib/db/schema.sql` exactly. The UI only ever reads these — not provider-specific or ingestion-stage types.
- **Layout JSON** is defined by `types/layout.ts` and validated by `lib/layout/schemas.ts` (zod). The renderer (`components/layout-renderer/`), the `layouts.spec` jsonb column, and AI-generated layouts all share this single shape. **If you change `types/layout.ts`, update `lib/layout/schemas.ts` in lockstep.**
- **All AI calls go through `lib/ai/`.** Do NOT import `@anthropic-ai/*` directly anywhere in `app/`, `components/`, or `lib/ingestion/`. The barrel (`lib/ai/index.ts`) is the only entry point. Prompts are versioned (`lib/ai/prompts/extract-receipt.v3.ts`) and every run is persisted to `extraction_runs` for audit/eval.
- **All ViewQuery → SQL translation lives in `lib/layout/query.ts`.** Don't sprinkle Supabase filter calls elsewhere; add operators/aggregations there.

### Auth

- **`lib/auth/dal.ts` is the only place that decides "is this request authed?"** — `verifySession()` (redirects to `/login`) and `tryVerifySession()` (returns null). Both are `React.cache`-memoized per request. Server Components / Server Actions / Route Handlers reading user data must call one of them.
- **`proxy.ts`** refreshes the session cookie on every request (uses `supabase.auth.getUser()`, not `getSession()` — the latter does not validate). It does **not** gate routes; gating happens via the DAL.
- **Pairing flow** (`lib/auth/pairing.ts`): desktop generates a single-use code → renders QR at `/pair/<code>` → phone scans → server consumes the code with the **admin client** (RLS bypassed; the row has no RLS policies on purpose) → trades for a magic-link `token_hash` → `/auth/confirm` calls `verifyOtp` → phone session cookies set. This is why `pairing_codes` exists outside the per-user RLS model.

### Database (Supabase Postgres)

`lib/db/schema.sql` is the canonical schema and is idempotent — re-run in the Supabase SQL editor whenever it changes. Notable invariants:

- **Every user-data table is RLS-gated by `user_id = auth.uid()`.** The join tables (`transaction_line_items`, `transaction_tags`, `extraction_runs`) scope through their parent. If you add a new user-data table, add the policy.
- **`receipts.file_hash`** (SHA-256 of uploaded bytes) is the duplicate-detection key. `lib/ingestion/upload.ts` hashes before touching storage, so re-uploading the same photo short-circuits.
- **Storage** uses a single `receipts` bucket; files live at `<user_id>/<receipt_id>.<ext>` and the bucket has owner-only RLS policies tied to the path prefix.
- **`handle_new_user` trigger** seeds default categories and a default "Feed" Layout for each new auth.users row. New user-onboarding state belongs in this trigger, not in app code.

### Ingestion pipeline (`lib/ingestion/upload.ts`)

For Phase 1, the full pipeline runs synchronously in the upload request:

```
hash dedupe → storage upload → receipts row (status='extracting')
  → extractReceipt (lib/ai) → extraction_runs row
  → normalizeReceipt → transactions + line_items
  → receipts.status = 'extracted' | 'needs_review' | 'failed'
```

`extraction_runs` is **always written**, success or failure — it's the audit trail and the future eval dataset. If extraction fails, storage uploads are rolled back to avoid orphans. Phase 2+ will move extract/normalize into a queue without changing callers.

### Claude Agent SDK gotchas (in `lib/ai/providers/anthropic.ts`)

These are non-obvious lessons baked into the current implementation — don't undo them:

- `outputFormat: { type: 'json_schema' }` is not reliably populated as `structured_output` in Agent SDK v0.2.x. We instruct the model to return plain JSON and parse it (with a fence-stripping fallback).
- `maxTurns: 2` is intentional. Claude Code's internal Haiku router runs alongside Sonnet and consumes a turn; `maxTurns: 1` cuts off the Sonnet response.
- PDFs require a `document` content block, not `image`. The MIME dispatch in `buildFileContentBlock` handles this — keep that branching when adding new file types.
- Under OAuth (the local-dev path), `total_cost_usd` is telemetry only, not a real bill.

## Project conventions

- **Path alias:** `@/*` → repo root (see `tsconfig.json`). Use it for all internal imports.
- **`import 'server-only'`** at the top of any file that must never bundle to the client (DAL, server Supabase, AI providers, ingestion). Don't remove these.
- **Server Components by default.** Client Components opt in with `'use client'`. The Supabase clients are split accordingly: `lib/supabase/server.ts`, `lib/supabase/client.ts`, `lib/supabase/admin.ts` (service-role, server-only, RLS bypassed — use sparingly).
- **UI primitives** come from shadcn (`components/ui/`, see `components.json`) and `@base-ui/react`. Tailwind v4 is configured via `@tailwindcss/postcss` (no `tailwind.config.*` file).
- **Phone vs computer** is a first-class concern: `dev:https` exists because camera APIs require HTTPS and the phone hits the dev box over LAN. The `/scan` route is the phone capture flow; `/upload` is the desktop drag-in flow.
