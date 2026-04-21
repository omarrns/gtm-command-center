# CLAUDE.md — GTM Command Center

## What This Is

Omar's browser-based autonomous job-search agent. It discovers roles, scores them, researches contacts, enriches emails, drafts outreach, queues opportunities for approval, sends approved emails through Gmail, and tracks replies. Single-user tool, not a product for others.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS v4 (CSS-based config, no tailwind.config.ts) + shadcn/ui
- **Database**: Supabase (Postgres + Auth)
- **Deployment**: Vercel
- **Font**: Geist (via next/font/google)
- **Icons**: Lucide React (14-16px standard sizes)

## Architecture

```
src/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   └── (app)/
│       ├── layout.tsx          # Auth gate → AppShell
│       ├── page.tsx            # Today queue
│       ├── history/
│       ├── watchlist/
│       ├── settings/
│       ├── actions.ts          # Today: trigger, approve, skip, flag, manual-apply
│       ├── onboard/
│       │   ├── page.tsx
│       │   ├── actions.ts
│       │   ├── interview-actions.ts
│       │   └── _components/    # onboard-router, onboard-client, interview-client, review-client
│       ├── activate/
│       │   ├── page.tsx
│       │   ├── actions.ts
│       │   └── _components/    # activation-client
│       ├── analysis/           # Detail pages; legacy list routes redirect
│       ├── research/           # Detail pages; legacy list routes redirect
│       └── _components/        # OpportunityCard, TodayClient, EmailVariantPicker
│   └── api/
│       ├── auth/gmail/         # OAuth start + callback
│       ├── activation/search/
│       ├── cron/pipeline/
│       ├── cron/replies/
│       ├── cron/watchlist/
│       ├── onboard/chat/       # Streaming interview endpoint
│       └── pipeline/run/
├── components/
│   ├── app-shell.tsx
│   ├── sidebar-nav.tsx         # Desktop aside + mobile Sheet
│   ├── top-bar.tsx
│   ├── command-palette.tsx
│   ├── page-header.tsx, list-item.tsx, empty-state.tsx
│   ├── detail-header.tsx, status-banner.tsx
│   └── ui/                     # shadcn/ui (owned source)
└── lib/
    ├── utils.ts                # cn(), formatRelativeTime(), assertEnv()
    ├── supabase/               # Server client, types, auth helpers
    ├── pipeline/               # JSearch, scoring, people search, opportunities
    │   └── steps/              # discover → score → research → enrich → draft
    ├── onboarding/             # Interview prompt, extraction prompt/logic
    ├── integrations/           # Gmail client + token crypto
    └── jobs/                   # Legacy async job handlers reused by pipeline
```

## Current State

Phase-by-phase build history is in `CHANGELOG.md` (not injected into context).

### Pipeline State Machine

```
discovered → scored → researched → enriched → drafted → queued → sending → sent → replied
                                                                    ↓
                                                                  skipped
```

- Stage transitions use precondition checks in `src/lib/pipeline/opportunities.ts`.
- Atomic claiming prevents concurrent pipeline runs from double-processing.
- Stale claims are recovered automatically.
- Per-opportunity failures set `last_error`, release claim, and continue the batch.
- Enrichment retries increment `enrichment_attempts` up to `max_enrichment_attempts`; terminal failure routes to `needs_contact`.
- Scoring auto-adds companies to watchlist when normalized score >= 80.

### Database Tables

| Table                   | Purpose                                                                                | Access                                             |
| ----------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `pipeline_config`       | Search queries, locations, score threshold, daily send cap, `activation_completed_at`  | Client: SELECT only. Mutations via server actions. |
| `opportunities`         | Pipeline stage, score, drafts, Gmail IDs. Dedupes by `(user_id, source, external_id)`. | RLS by user. Cross-table ownership trigger.        |
| `gmail_credentials`     | Encrypted refresh tokens                                                               | Service-role only. No client RLS.                  |
| `watchlist`             | Monitored companies + Exa Webset IDs                                                   | RLS by user.                                       |
| `watchlist_alerts`      | Exa Webset items, deduped by `source_item_id`                                          | RLS by user.                                       |
| `user_scoring_profiles` | Derived scoring fields + user-editable weights (0.5-2.0)                               | RLS by user.                                       |
| `onboarding_interviews` | Interview state, messages, extracted data. Partial unique index (one active per user). | Client: SELECT only. Mutations via service-role.   |
| `memory_documents`      | User profile, positioning, outreach style, dealbreakers, interview insights            | RLS by user.                                       |

Migrations live in `supabase/migrations/`. TypeScript row types in `src/lib/supabase/types.ts`.

### Auth and Security

- All cron endpoints: `GET`, bearer `CRON_SECRET`, fail-closed if missing/mismatched.
- Manual pipeline trigger: `POST`, authenticated with `requireUser()`.
- Gmail OAuth: PKCE + signed state + nonce cookies. Scopes: `gmail.send`, `gmail.metadata`.
- Refresh tokens: AES-256-GCM encrypted in `gmail_credentials`.
- `pipeline_config` client-readable but not client-writable (SELECT-only RLS).

### Cron Schedules (owned by `vercel.json`)

| Route                 | Schedule             | Purpose                                                       |
| --------------------- | -------------------- | ------------------------------------------------------------- |
| `/api/cron/pipeline`  | `0 4,10,16,22 * * *` | Discover (last-day posts) → score → research → enrich → draft |
| `/api/cron/replies`   | `*/30 * * * *`       | Check Gmail threads for replies, advance `sent → replied`     |
| `/api/cron/watchlist` | `0 11 * * *`         | Ingest Exa Webset alerts                                      |

All use `maxDuration = 300`.

### Send Flow (Safety-Critical)

1. `reserve_send_slot` atomically moves `queued → sending` under daily send cap.
2. Gmail API sends; stores `gmail_thread_id`, `gmail_message_id`, `sent_at`.
3. **After Gmail returns IDs, NEVER revert to `queued`.** Post-send DB failures return a controlled reconciliation error to avoid duplicate sends.
4. Headers sanitized, subject MIME-encoded before send.
5. Reply tracking uses metadata/minimal thread reads only — never reads message bodies.

### Onboarding Flow

- `isOnboardingComplete()` checks three records: `user_profile` doc, `pipeline_config` row, `feedback_outreach_style` doc.
- Today page redirects to `/onboard` if incomplete (`DEV_SKIP_ONBOARDING=true` bypasses).
- Primary path: AI interview (`InterviewClient` → `ReviewClient` → confirm). Manual wizard is escape hatch.
- Interview streams via `/api/onboard/chat` using `streamText` + `claude-sonnet-4-6`.
- Extraction uses `claude-opus-4-6` to produce wizard-compatible fields + richer insights.
- Confirm upserts memory docs, pipeline_config, scoring profile, then marks interview `confirmed`.
- `topics_covered` controls which extracted values overwrite existing settings on refresh.
- Post-confirm routes to `/activate` (first-time) or `/settings` (refresh).

### Activation Flow

- `/activate` runs JSearch + fast scoring (`claude-sonnet-4-6`) to show first results.
- Redirects to `/` once `activation_completed_at` is set. All exit paths call `dismissActivationAction()` first.

### Sender Identity + Prompts

- `extractSenderIdentity(ctx, displayName)` in `src/lib/skills/sender-identity.ts` builds `SenderIdentity` from onboarding docs.
- All prompt files are builder functions accepting `SenderIdentity` (not static exports).
- `loadMemoryContext()` resolves `user_profile`, falls back to legacy `user_omar_profile`.
- `normalizeScoringProfile()` derives structured scoring fields from onboarding data; triggered after any onboarding/config save.

### LLM Output Validation

- High-value LLM boundaries (onboarding extraction, scoring) use AI SDK v6 `generateObject` + zod schemas. Types are derived via `z.infer` — schema is the source of truth.
  - `src/lib/onboarding/extraction.ts` — `extractionResultSchema`, lenient (per-field `.default()` fallbacks).
  - `src/lib/pipeline/scoring.ts` — `analysisSchema`, strict (malformed output throws → `last_error` set, pipeline continues).
- Lower-traffic / free-form outputs (draft generation, people search, planner, career-coach, analysis actions) still use `runClaudeJson` in `src/lib/ai/anthropic.ts`. Prefer `generateObject` + zod for new LLM call sites where the output shape is stable and consumed as structured data.
- Model slug format uses hyphens (`claude-opus-4-6`, `claude-sonnet-4-6`) throughout the codebase.

### Shared UI Patterns

- **UI primitives live in `src/components/ui/`.** Use `<Button>`, `<Input>`, `<Textarea>`, `<Badge>`, `<Alert>` — never `className="btn-primary"`, `className="input"`, `className="badge"`, or hand-rolled banners. For anchors and `next/link` that need button styling, use `buttonVariants()` from `@/components/ui/button`.
- `PageHeader` on every list page. `DetailHeader` on every detail page. `EmptyState` for zero items. `<Alert>` (with optional `<RefreshCw className="animate-spin">` for running states) for status banners.
- `command-palette.tsx` and `sidebar-nav.tsx` are **intentionally custom** — they own spring motion, LayoutGroup active-pill, and ⌘K / ⌘B shortcuts. Do not swap them for shadcn `command` / `sidebar` without an explicit ask.
- Background jobs: server action enqueues → client polls via `useJobPoll(jobId)` → `router.refresh()` on completion.
- Toast: `toast` from `"sonner"`.
- Sidebar: desktop `w-60` aside, mobile Sheet. State in `AppShell`.
- `OpportunityCard` is unified across Activate, Today, and History views.

## Design System

Implementation companion to `.impeccable.md` (design language, personality, principles).

### Tokens (in `globals.css`)

**App tokens** (via `var()`): `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-surface`, `--color-surface-muted`, `--color-blue`, `--color-blue-muted`, `--color-success`, `--color-warning`, `--color-danger`, `--color-border-strong`.

**shadcn tokens** (via Tailwind): `--background`, `--foreground`, `--card`, `--muted`, `--primary`, `--border`, etc.

Both respond to `.dark` class. **Never use `--color-accent` for blue** — that's shadcn's hover state token. Our blue is `--color-blue`.

### Component Classes (globals.css)

Only `.surface` and `.surface-muted` remain — container utilities, not primitives. All button / input / badge / banner styling lives in the shadcn primitives under `src/components/ui/`.

## Scripts

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run seed             # Run all imports
npm run onboard:reset    # Delete all onboarding data
npm run onboard:fixture  # Seed: --state=partial|complete|empty --interview-state=transcript|review|ready
npm run test:sender-identity  # Verify prompt de-Omarification
npm run test:extraction       # Run extraction on transcript fixture
npm run test:correctness      # Verify recent pipeline correctness guardrails
```

## Behavioral Principles

These govern how you approach work. Follow them before touching any code.

### 1. Think Before Coding

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Read existing files first. Match their patterns.
- Check if an existing function or dependency already solves the problem.
- For changes touching more than 3 files, explain the plan first.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Extract after 3 repetitions, not 2. Premature abstraction is worse than duplication.
- Three similar lines are better than one clever abstraction used once.
- Never abstract across domain boundaries. Scrape helpers stay in scrape, score helpers stay in score.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
- Do not remove or replace working code unless explicitly asked.

The test: every changed line should trace directly to the request.

### 4. Goal-Driven Execution

Transform tasks into verifiable goals. Loop until verified.

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Success criteria let you work independently. Weak criteria ("make it work") require constant clarification.

---

## Technical Rules

These are not guidelines. They are constraints. Violating any rule is a bug.

### File Size

- **Hard limit: 400 lines per file.** No exceptions for "data files," schemas, or prompts.
- If a file approaches 400 lines, split it before adding code. Extract the largest coherent unit into a new file named after what it does (`score-fit.ts`), not where it came from (`score-helpers.ts`).

### Functions

- One clear purpose per function. If you need the word "and" to describe it, split it.
- Max 2 levels of callback nesting. Flatten with early returns or extract helpers.
- Functions are verbs: `fetchJobSignals`, `scoreAccount`, `validateFactLedger`.
- Max 50 lines per function body. If it's longer, it has more than one responsibility.

### Naming

- Variables are nouns. Functions are verbs. Booleans start with `is`, `has`, or `should`.
- No abbreviations except `id`, `url`, `db`.
- If a variable needs a comment to explain what it is, rename it instead.

### TypeScript

- Strict mode in `tsconfig.json`. No exceptions.
- Never use `any`. Use `unknown` and narrow explicitly.
- Infer types from Zod schemas via `z.infer<typeof Schema>`. Never hand-write a parallel type that duplicates a schema.
- All data crossing a trust boundary (Claude output, API response, user input, database row) must be validated with Zod before use. A validation failure is an error, not a fallback.

### Comments and Documentation

- Comments explain WHY, never WHAT. The code explains what.
- Delete commented-out code. It lives in git.
- Every non-obvious business rule gets a one-line comment with context.
- No JSDoc on internal functions unless the signature is genuinely ambiguous.

### Error Handling

- Never swallow errors with empty catch blocks.
- Throw early, catch at the boundary (API route handler, cron handler).
- Log errors with context: what was attempted, what inputs were passed, what failed.
- Per-row error isolation in batch processing: one bad record does not kill the run.

### Imports and Dependencies

- Check if existing dependencies cover the need before adding new ones.
- Prefer thin fetch-based HTTP clients over heavy SDKs for third-party APIs.
- No circular imports. If module A imports from B and B needs something from A, extract the shared piece into C.

### Environment and Secrets

- Never hardcode secrets or API keys. Use environment variables.
- Every new env var gets added to `.env.local.example` with a comment.
- Never log secrets, tokens, or API keys, even in error messages.

### Database

- Never modify existing production columns. Add new columns instead.
- Every schema change gets its own migration file in `supabase/migrations/`.
- No raw SQL in pipeline files. Named query functions live in dedicated query files.

### Prompts

- Prompts are business logic. Version and review them like code.
- All prompts live in `src/lib/ai/prompts/`, exported as typed constants with model + temperature.
- Never inline a multi-line prompt string in a route handler or pipeline function.
- When a prompt changes, the commit message explains what behavior the change targets.

### Testing

- Score logic: unit test with fixture data. No Claude, no DB. Pure TS, fast, deterministic.
- Zod schemas: test with saved Claude output fixtures. Run after any prompt change.
- Never mock Claude in tests meant to catch prompt regressions. A mock cannot tell you if your prompt broke.
- Fixtures live in `src/lib/pipeline/__tests__/fixtures/`.

### Idempotency

Every pipeline stage must be safe to run twice on the same input.

- Scrape: upsert on `(account_id, source, scraped_at::date)`.
- Reason: skip Claude if `extracted_facts` already exists for this signal.
- Score: upsert (overwrite) the account's score row.
- Commentary: overwrite `why_now_hook` on the existing score row.
