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
│       ├── actions.ts          # Today: trigger, approve, skip, flag
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

| Route                 | Schedule       | Purpose                                                       |
| --------------------- | -------------- | ------------------------------------------------------------- |
| `/api/cron/pipeline`  | `0 4,16 * * *` | Discover (last-day posts) → score → research → enrich → draft |
| `/api/cron/replies`   | `*/30 * * * *` | Check Gmail threads for replies, advance `sent → replied`     |
| `/api/cron/watchlist` | `0 11 * * *`   | Ingest Exa Webset alerts                                      |

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

### Shared UI Patterns

- `PageHeader` on every list page. `DetailHeader` on every detail page. `EmptyState` for zero items. `StatusBanner` for running/failed.
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

`.surface`, `.surface-muted`, `.btn-primary`, `.btn-ghost`, `.input`, `.badge` + `.badge-success/warning/danger/accent`.

## Scripts

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run seed             # Run all imports
npm run onboard:reset    # Delete all onboarding data
npm run onboard:fixture  # Seed: --state=partial|complete|empty --interview-state=transcript|review|ready
npm run test:sender-identity  # Verify prompt de-Omarification
npm run test:extraction       # Run extraction on transcript fixture
```

---

## Code Standards

### Before Writing Code

- Read existing files first. Match their patterns.
- Extend existing functions instead of creating parallel implementations.
- Check if existing dependencies cover the need before adding new ones.
- Do not remove or replace working code unless explicitly asked.
- Never overwrite a file without reading it first.

### Naming

- Functions: verbs (`fetchUser`, `parseTranscript`). Variables: nouns.
- No abbreviations except `id`, `url`, `db`.
- Booleans start with `is`, `has`, or `should`.
- If a variable needs a comment, rename it instead.

### Structure

- Split files by concern, not line count.
- No callbacks more than 2 levels deep.
- One clear purpose per function.

### Comments and Errors

- Comments explain WHY, never WHAT. Delete commented-out code.
- Every non-obvious business rule gets a comment with context.
- Never swallow errors with empty catch blocks.
- Throw early, catch at the boundary (API route, CLI entry).
- Log errors with context: what was attempted, what inputs.

### Environment and Database

- Never hardcode secrets. Use env vars. Add new ones to `.env.example`.
- Never modify existing production columns. Add new columns instead.
- Every schema change gets its own migration file.

### DRY and Changes

- Extract after 3 repetitions, not 2. Don't abstract across domain boundaries.
- For changes touching >3 files, explain the plan before writing code.
- Do not refactor unrelated code in the same change.
- Run the linter after changes.
