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
│   ├── layout.tsx          # Root layout — ThemeProvider, TooltipProvider, Toaster
│   ├── globals.css         # All design tokens, component classes, light/dark theme
│   └── (app)/
│       ├── layout.tsx      # Auth gate → AppShell wrapper
│       ├── page.tsx        # Today queue: review, approve/send, skip, flag
│       ├── history/        # Sent/replied/skipped/filterable historical view
│       ├── watchlist/      # Company monitoring + alert review
│       ├── settings/       # Pipeline config + Gmail connect/disconnect
│       ├── actions.ts      # Today actions: trigger pipeline, approve, skip, flag
│       ├── analysis/       # Kept detail pages; legacy list/intake routes redirect
│       ├── research/       # Kept report detail pages; legacy list/new routes redirect
│       └── _components/    # OpportunityCard, TodayClient, EmailVariantPicker
│   └── api/
│       ├── auth/gmail/     # Gmail OAuth start + callback
│       ├── cron/pipeline/  # Daily autonomous pipeline cron
│       ├── cron/replies/   # Reply tracking cron
│       ├── cron/watchlist/ # Daily Exa watchlist alert ingestion
│       └── pipeline/run/   # Authenticated manual pipeline trigger
├── components/
│   ├── app-shell.tsx       # Client wrapper — manages sidebar state
│   ├── sidebar-nav.tsx     # Responsive: desktop aside + mobile Sheet
│   ├── top-bar.tsx         # Title + hamburger (mobile) + ⌘K button
│   ├── command-palette.tsx # cmdk-based, ⌘K toggle
│   ├── page-header.tsx     # Shared: title + description + action buttons
│   ├── list-item.tsx       # Shared: clickable row with title/subtitle/meta
│   ├── empty-state.tsx     # Shared: centered message + CTA
│   ├── detail-header.tsx   # Shared: back arrow + title + subtitle + actions
│   ├── status-banner.tsx   # Shared: running spinner or failed error
│   └── ui/                 # shadcn/ui components (owned source code)
│       ├── button.tsx, badge.tsx, card.tsx, input.tsx, textarea.tsx
│       ├── label.tsx, separator.tsx, skeleton.tsx
│       ├── sheet.tsx, dialog.tsx, tooltip.tsx, sonner.tsx
└── lib/
    ├── utils.ts            # cn(), formatRelativeTime(), assertEnv()
    ├── supabase/           # Server client, types, auth helpers
    ├── pipeline/           # JSearch, scoring, people search, opportunity helpers
    │   └── steps/          # discover → score → research → enrich → draft
    ├── integrations/       # Gmail client + token crypto
    └── jobs/               # Legacy async job handlers reused by pipeline
```

## Implementation Notes — 2026-04-07

### Phase 0 — Integration Validation

- Exa Websets people search and enrichment drove the current pipeline design: research stores Webset person IDs, and enrichment runs against Webset enrichment endpoints.
- Gmail feasibility is reflected in the Phase 4 OAuth implementation using `gmail.send` and `gmail.metadata` scopes with PKCE and encrypted refresh-token storage.
- Throwaway spike artifacts are not part of the current product surface; treat the retained implementation files as the source of truth.

### Phase 1 — Schema, Config, and Security Foundation

- Pipeline tables and security foundation live in `supabase/migrations/20260407000001_pipeline_v2.sql`.
- Helper migrations:
  - `20260407000002_pipeline_v2_helpers.sql`
  - `20260407000003_atomic_claim_opportunity.sql`
  - `20260407000004_add_recipient_webset_id.sql`
  - `20260407000005_reserve_send_slot.sql`
- Core tables: `pipeline_config`, `gmail_credentials`, `opportunities`, `watchlist`, and `watchlist_alerts`.
- Important constraints and controls:
  - `opportunities.stage` is constrained to the pipeline stages from `discovered` through `replied`/`skipped`.
  - `opportunities` dedupes by `(user_id, source, external_id)`.
  - Cross-table ownership trigger validates linked analysis, research, and selected draft ownership.
  - `gmail_credentials` has no client RLS policies; access is service-role only.
  - Pipeline config is client-readable but updated through server-side actions.
- TypeScript row types are maintained in `src/lib/supabase/types.ts`.
- JSearch was ported to `src/lib/pipeline/jsearch.ts`.
- Opportunity helpers, atomic claiming, stale-claim recovery, and stage precondition transitions live in `src/lib/pipeline/opportunities.ts`.

### Phase 2 — Autonomous Pipeline

- Pipeline runner: `src/lib/pipeline/runner.ts`.
- Pipeline steps:
  - `steps/discover.ts`: JSearch discovery with insert cap and dedup.
  - `steps/score.ts`: full-analysis scoring, threshold routing, auto-watchlist at high score.
  - `steps/research.ts`: Exa Websets people search, stores `recipient_webset_id` and `recipient_webset_item_id`, routes missing contacts to `needs_contact`.
  - `steps/enrich.ts`: Exa Websets email enrichment, retry cutoff, cleanup, and `needs_contact` routing on terminal failure.
  - `steps/draft.ts`: CEO vs growth-leader prompt selection, exactly two variants, selected draft assignment, and `queued` transition.
- Cron endpoint: `src/app/api/cron/pipeline/route.ts`.
  - `GET`, bearer `CRON_SECRET`, fail-closed if missing/mismatched.
  - Iterates all `pipeline_config` rows.
  - `maxDuration = 300`.
- Manual trigger endpoint: `src/app/api/pipeline/run/route.ts`.
  - `POST`, authenticated with `requireUser()`.
  - Single-user scoped.
  - `maxDuration = 300`.
- Vercel cron:
  - `/api/cron/pipeline` at `0 10 * * *`.

### Phase 3 — Today, History, and Settings UI

- Home route is `src/app/(app)/page.tsx`; root `src/app/page.tsx` was removed to avoid a duplicate `/` route.
- Today queue actions are in `src/app/(app)/actions.ts`:
  - `triggerPipelineAction()` calls `/api/pipeline/run` and forwards cookies.
  - `approveOpportunityAction()` reserves a send slot and sends through Gmail in Phase 4.
  - `skipOpportunityAction()` uses stage preconditions.
  - `flagCompanyAction()` validates watchlist upsert and skip transition results.
  - `updateSelectedDraftAction()` validates the draft belongs to the same user and opportunity.
- Shared Today UI components:
  - `src/app/(app)/_components/opportunity-card.tsx`
  - `src/app/(app)/_components/email-variant-picker.tsx`
  - `src/app/(app)/_components/today-client.tsx`
- History:
  - `src/app/(app)/history/page.tsx`
  - `src/app/(app)/history/history-client.tsx`
  - `src/app/(app)/history/actions.ts`
  - Supports status, company search, and min/max score filters.
  - History cards are read-only for draft variants.
- Settings:
  - `src/app/(app)/settings/page.tsx`
  - `src/app/(app)/settings/actions.ts`
  - `src/app/(app)/settings/_components/settings-client.tsx`
  - Handles pipeline configuration and Gmail connect/disconnect controls.
- Legacy v1 routes that are not part of v2 redirect instead of remaining active product surfaces.

### Phase 4 — Gmail Send and Reply Tracking

- OAuth routes:
  - `src/app/api/auth/gmail/route.ts`: starts Google OAuth with PKCE, signed state, nonce cookies, and `gmail.send`/`gmail.metadata` scopes.
  - `src/app/api/auth/gmail/callback/route.ts`: validates signed state, nonce, and user binding before token exchange.
- Gmail integration:
  - `src/lib/integrations/gmail.ts`: authenticated Gmail client, send email, reply checks, token revocation.
  - `src/lib/integrations/crypto.ts`: AES-256-GCM encryption for stored refresh tokens.
  - Dependencies: `googleapis` and `google-auth-library`.
- Send flow in `approveOpportunityAction()`:
  - Uses `reserve_send_slot` to atomically move `queued -> sending` under the daily send cap.
  - Sends with Gmail API and stores `gmail_thread_id`, `gmail_message_id`, and `sent_at`.
  - After Gmail returns IDs, never reverts to `queued`; post-send DB failures return a controlled reconciliation error to avoid duplicate sends.
  - Header values are sanitized and the subject is MIME-encoded before Gmail send.
- Reply tracking:
  - `src/app/api/cron/replies/route.ts`.
  - `GET`, bearer `CRON_SECRET`, fail-closed if missing/mismatched.
  - Uses Gmail metadata/minimal thread reads only; does not read message bodies.
  - Advances `sent -> replied` only when the stage transition succeeds.
- Vercel cron:
  - `/api/cron/replies` at `*/30 * * * *`.

### Phase 5 — Watchlist Monitoring

- Watchlist pipeline logic lives in `src/lib/pipeline/watchlist.ts`.
- `addToWatchlist()` is idempotent and returns a discriminated union:
  - `created` for newly inserted rows.
  - `duplicate` for existing rows.
  - `error` for insert/monitor setup failures that callers must handle.
- Exa setup is split into:
  - Webset creation for the company search.
  - Monitor creation via the documented `/websets/v0/monitors` API shape with `websetId`, cron cadence, UTC timezone, and append search behavior.
- Duplicate watchlist adds repair missing monitor state by creating a Webset/monitor when an existing row lacks `webset_id`.
- `processWatchlistAlerts()` ingests Exa Webset items into `watchlist_alerts`, deduping by `source_item_id`; `last_alert_at` updates only when at least one genuinely new alert is inserted.
- `removeFromWatchlist()` deletes the local row and best-effort cleans up the external Exa Webset; cleanup failures are logged but do not block local deletion.
- High-scoring opportunities are auto-added from `steps/score.ts` when normalized score is `>= 80`.
- Watchlist UI:
  - `src/app/(app)/watchlist/page.tsx`
  - `src/app/(app)/watchlist/actions.ts`
  - `src/app/(app)/watchlist/_components/watchlist-client.tsx`
- Watchlist cron:
  - `src/app/api/cron/watchlist/route.ts`
  - `GET`, bearer `CRON_SECRET`, fail-closed if missing/mismatched.
  - Vercel schedule: `/api/cron/watchlist` at `0 11 * * *`.

### Phase 6 — Settings UI

- Settings page files:
  - `src/app/(app)/settings/page.tsx`
  - `src/app/(app)/settings/actions.ts`
  - `src/app/(app)/settings/_components/settings-client.tsx`
- Editable pipeline config:
  - Score threshold: integer `0-100`.
  - Search queries: tag input, max 10, each 1-100 chars.
  - Search locations: tag input, max 10, each 1-100 chars.
  - Daily send cap: integer `0-50`.
- `updateConfigAction()` is authenticated with `requireUser()`, validates all inputs server-side, updates `pipeline_config` with the service client, and verifies a row was actually updated via `.select("id").maybeSingle()`.
- `pipeline_config` remains client-readable only; direct client UPDATE is blocked by RLS because only a SELECT policy exists.
- Pipeline runs consume the updated config on the next run:
  - Discover uses `search_queries` and `search_locations`.
  - Score uses `score_threshold`.
  - Send-slot reservation reads `daily_send_cap`.
- Gmail settings:
  - Settings shows connected/disconnected status plus connect/disconnect controls.
  - `disconnectGmailAction()` calls `revokeToken(user.id)`.
  - `revokeToken()` treats Google revoke as best-effort, but throws on local Supabase credential delete or `gmail_send_address` clear failures so the UI can surface cleanup errors.
- Cron schedule is displayed as read-only Settings information; schedules are owned by `vercel.json`.

### Phase 7 — Polish + Metrics

- Today dashboard metrics were added in:
  - `src/app/(app)/page.tsx`
  - `src/app/(app)/_components/today-client.tsx`
- Header metrics now include:
  - Reply rate across `sent` + `replied`.
  - Sent today versus `daily_send_cap`.
  - Sent this week, bounded Monday 00:00 UTC to next Monday 00:00 UTC.
  - Average score of sent/replied opportunities.
  - Funnel counts for `discovered -> replied`.
- Metric queries are independent and run in parallel via `Promise.all(...)`; average score and funnel counts are computed in app code from minimal column selects (`score`, `stage`).
- Today UI now renders:
  - A 4-card responsive metrics grid.
  - A pipeline funnel row using badge-styled stage/count pills.
  - Existing manual trigger button with inline running state (`Running…` + spinner) still handles the manual pipeline action.
- Loading state polish:
  - `src/app/(app)/loading.tsx` now includes skeletons for the header, four metric cards, funnel bar, and five opportunity cards.
- Discovery error isolation:
  - `src/lib/pipeline/steps/discover.ts` wraps each `createOpportunity(...)` insert in a per-job `try/catch`.
  - A single bad insert is logged with the JSearch job ID and does not abort the rest of the discovery batch.
- Existing Phase 2+ pipeline error handling remains the baseline:
  - Per-opportunity failures in score/research/draft/enrich set `last_error`, release claims, and continue the batch.
  - Enrichment retry behavior still increments `enrichment_attempts` and respects `max_enrichment_attempts`.

### Phase 8 — Onboarding: Self-Serve User Intake

- Onboarding detection: `src/lib/pipeline/onboarding.ts` — `isOnboardingComplete()` checks three records in parallel (user_profile doc, pipeline_config row, feedback_outreach_style doc).
- Onboarding gate: `src/app/(app)/page.tsx` redirects to `/onboard` if incomplete. `DEV_SKIP_ONBOARDING=true` bypasses in development.
- Wizard: `src/app/(app)/onboard/page.tsx` (server) + `onboard/_components/onboard-client.tsx` (client). 4-step wizard: About You → Search Prefs → Outreach → Gmail.
- Server actions: `src/app/(app)/onboard/actions.ts` — `saveProfileAction`, `saveSearchConfigAction`, `saveOutreachAction`. All upsert with `origin: 'onboarding'` and `onConflict` for safe re-runs.
- Context layer: `src/lib/skills/context.ts` — `loadMemoryContext()` resolves `user_profile` first, then falls back to the legacy personal profile key `user_omar_profile`. `CLAUDE.md` is project context only and is no longer used as personal profile fallback.
- Scoring: `src/lib/pipeline/scoring.ts` now includes `user_profile`, `user_positioning`, and `user_dealbreakers` in the key array for `formatMemoryForPrompt()`.
- Drafting: `src/lib/pipeline/steps/draft.ts` now includes `user_profile` and `user_positioning` in the key array. Prompt parameter renamed from `omarProfile` → `senderProfile`. Privacy guard genericized.
- Prompt builders: `email-b2b-customer-support.ts` and `email-head-of-growth.ts` — parameter renamed `omarProfile` → `senderProfile`, template labels genericized (`Omar's Profile` → `Sender Profile`).
- Profile Refresh: Settings links to `/onboard?mode=refresh`, which bypasses the redirect guard and pre-fills all fields.
- Gmail return path: OAuth start route accepts `?return_to=` param, stores in cookie. Callback reads cookie and redirects back (onboarding → `/onboard?step=4`, settings → `/settings?gmail_connected=true`).
- Step deep-linking: Wizard supports `?step=N` URL parameter.
- Dev tooling: `npm run onboard:reset` (deletes onboarding data + scoring profile), `npm run onboard:fixture -- --state=partial|complete|empty`.

### Phase 9 — Prompt De-Omarification + Structured Scoring Profile

- Sender identity layer:
  - `src/lib/skills/sender-identity.ts` defines `SenderIdentity` plus `extractSenderIdentity(ctx, displayName)`.
  - Supports both Phase 8 sectioned onboarding docs and legacy freeform seeded profiles.
  - Required fields: `firstName`, `fullName`, `positioning`, `tools`, `proofPoints`, `outreachTone`.
  - Optional fields: `recentCompany`, `recentCompanyDescriptor`, `recentRole`, `domainInsiderClaim`, `signOff`.
  - `ctx.positioning` is preferred over section parsing when present.
- Prompt conversion:
  - All prompt files were converted from static `*_SYSTEM` exports to builder functions accepting `SenderIdentity`.
  - Converted files:
    - `email-b2b-customer-support.ts`
    - `email-head-of-growth.ts`
    - `full-analysis.ts`
    - `jd-fit-rubric.ts`
    - `company-fit-analyzer.ts`
    - `career-coach.ts`
    - `people-research.ts`
    - `create-prompt.ts`
    - `create-skill.ts`
  - Prompt sections that depend on optional sender fields now use conditional omission instead of empty interpolation.
- Consumer updates:
  - `src/lib/pipeline/scoring.ts`
  - `src/lib/pipeline/steps/draft.ts`
  - `src/lib/pipeline/people-search.ts`
  - `src/lib/jobs/handlers/company-fit-analyzer.ts`
  - `src/lib/jobs/handlers/career-coach.ts`
  - `src/app/(app)/outreach/actions.ts`
  - `src/app/(app)/analysis/actions.ts`
  - `src/app/(app)/workspace-tools/actions.ts`
  - All now extract sender identity from `loadMemoryContext()` and call prompt builders rather than importing static system constants.
- Context cleanup:
  - `src/lib/skills/context.ts` comments and fallback behavior are genericized.
  - Candidate scoring/drafting memory no longer includes `CLAUDE.md`; only personal profile docs are passed into those prompts.
  - `src/lib/skills/index.ts`, `src/app/layout.tsx`, and UI copy were genericized to remove stale Omar-specific naming.
- Structured scoring profile:
  - Migration: `supabase/migrations/20260408000001_user_scoring_profiles.sql`
  - New table: `user_scoring_profiles`
  - Layer 1 derived fields:
    - `role_fit_keywords`
    - `seniority_years`
    - `preferred_stages`
    - `preferred_domains`
    - `tool_familiarity`
    - `proof_points`
    - `dealbreaker_patterns`
  - Layer 2 weights:
    - `weight_role_fit`
    - `weight_seniority`
    - `weight_stage`
    - `weight_domain`
    - `weight_stack`
    - `weight_proof_points`
    - `weight_dealbreaker`
  - Layer 2 structured preferences:
    - `target_roles`
    - `target_locations`
    - `green_flags`
    - `red_flags`
  - Weight columns are constrained to `0.5–2.0` with database `CHECK` constraints.
- Normalization:
  - New file: `src/lib/pipeline/scoring-profile.ts`
  - `normalizeScoringProfile(svc, userId)` derives structured fields from onboarding memory docs + `pipeline_config`.
  - Stage/domain vocabularies are explicit in code.
  - Upsert overwrites derived fields while preserving user-edited weight columns.
  - Triggered after:
    - `saveProfileAction`
    - `saveSearchConfigAction`
    - `saveOutreachAction`
    - `updateConfigAction`
- Scoring enhancement:
  - `src/lib/pipeline/scoring.ts` loads `user_scoring_profiles` with `.maybeSingle()`.
  - Missing row fallback keeps behavior identical to pre-Phase-9 scoring:
    - all weights default to `1.0`
    - structured preference arrays are treated as empty
  - Structured preferences are injected into the full-analysis prompt when a profile row exists.
  - Post-Claude score weighting is applied across JD Fit and Strategic Fit dimensions using the mapping from the Phase 9 plan.
- Settings UI:
  - `src/app/(app)/settings/page.tsx` loads the scoring profile.
  - `src/app/(app)/settings/_components/settings-client.tsx` renders:
    - read-only derived tags for roles/tools/stages/domains
    - weight sliders from `0.5x` to `2.0x`
  - `src/app/(app)/settings/actions.ts` adds `updateScoringWeightsAction` with range validation.
- Verification artifacts:
  - `scripts/test-sender-identity.ts` builds all converted prompts from synthetic sender fixtures and asserts:
    - no Omar/Inkeep leakage
    - sender identity appears where expected
    - optional-null branches produce coherent output
  - `npm run test:sender-identity` runs this script.
  - `onboard:reset` and `onboard:fixture` now also clear/manage `user_scoring_profiles`.

## Design System

### Token Architecture

All color tokens live in `:root` (light) and `.dark` (dark) blocks in `globals.css`. They respond to the theme automatically.

**App tokens** (used via `var()` in inline styles):

- `--color-text`, `--color-text-muted`, `--color-text-subtle` — text hierarchy
- `--color-surface`, `--color-surface-muted` — card backgrounds
- `--color-blue`, `--color-blue-muted` — brand accent (focus rings, spinners, accents)
- `--color-success`, `--color-warning`, `--color-danger` — semantic status
- `--color-border-strong` — heavier borders

**shadcn tokens** (used via Tailwind classes like `bg-card`, `text-muted-foreground`):

- `--background`, `--foreground`, `--card`, `--muted`, `--primary`, `--border`, etc.

Both sets map to the same palette and both respond to `.dark` class.

### Component Classes (globals.css)

- `.surface` — white card with border + large radius
- `.surface-muted` — muted bg card with border + medium radius
- `.btn-primary` — dark bg button with hover/active/disabled states
- `.btn-ghost` — transparent button with hover bg
- `.input` — form input with blue focus ring
- `.badge` + `.badge-success/warning/danger/accent` — status pills (dark mode variants included)

### Naming Collision Note

shadcn's `--color-accent` (hover background) conflicts with our original blue accent. Our blue is `--color-blue` / `--color-blue-muted`. Never use `--color-accent` for the blue — that's shadcn's hover state token.

## Design Principles (from .impeccable.md)

1. **Data density over decoration** — every pixel serves comprehension
2. **Status at a glance** — scannable badges, scores, states
3. **Keyboard-first, mouse-friendly** — ⌘K nav, focus-visible rings, 120ms transitions
4. **Consistency is kindness** — use shared components, never duplicate patterns
5. **Quiet confidence** — no spinners without context, no empty states without guidance

Reference: Linear. Personality: calm, precise, confident.

## Shared Components — When to Use What

| Component      | Use for                                                             |
| -------------- | ------------------------------------------------------------------- |
| `PageHeader`   | Every list page (title + description + action buttons)              |
| `ListItem`     | Clickable rows in list pages (analysis, outreach, research, memory) |
| `EmptyState`   | When a list has zero items (message + hint + CTA)                   |
| `DetailHeader` | Every detail/edit page (back arrow + title + subtitle + actions)    |
| `StatusBanner` | Running or failed state on detail pages                             |

## Providers (root layout)

- `ThemeProvider` (next-themes) — `defaultTheme="light"`, `attribute="class"`
- `TooltipProvider` (shadcn) — wraps all content
- `Toaster` (sonner) — positioned bottom-right, themed via shadcn tokens

## Key Patterns

### Background Jobs

Analysis and research use async background jobs. The pattern:

1. Server action enqueues a job → returns `jobId`
2. Client polls via `useJobPoll(jobId)` hook
3. On completion, `router.refresh()` to re-fetch server data
4. `StatusBanner` shows running/failed state

### Toast Notifications

Import `toast` from `"sonner"`. Used in draft-editor and memory-editor for save/copy feedback.

### Responsive Sidebar

- Desktop (md+): fixed `w-60` aside
- Mobile (<md): hidden, triggered via hamburger in TopBar, rendered in `Sheet` (side="left")
- State managed in `AppShell` (client component), layout.tsx is a thin server wrapper

## Scripts

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run import:memory    # Seed memory docs from .claude/ files
npm run import:evaluations
npm run import:research
npm run import:outreach
npm run import:coaching
npm run seed             # Run all imports
```

---

## Code Standards

These rules optimize for one thing: Omar being able to read and modify his own code later without AI help. Clean code = code that's easy to change later.

### Before writing code

- Read existing files in the relevant directory first. Match their patterns.
- If a similar function already exists, extend it. Do not create parallel implementations.
- Before adding a dependency, check if the same thing can be done with what's already installed.

### Safety

- Do not remove or replace existing working code unless explicitly asked.
- If you're unsure what something does, ask before modifying it.
- Never overwrite a file without reading it first.

### Naming

- Functions: verbs (`fetchUser`, `parseTranscript`). Variables: nouns.
- No abbreviations except industry-standard (`id`, `url`, `db`).
- Boolean variables start with `is`, `has`, or `should`.
- If you need a comment to explain a variable, rename it instead.

### Structure

- If a file has multiple unrelated concerns, split it. Line count alone isn't the trigger.
- No callbacks more than 2 levels deep.
- One clear purpose per function. When a function does three things, changing one breaks the other two.

### Comments

- Comments explain WHY, never WHAT. The code shows what.
- Delete commented-out code. Git remembers it.
- Every non-obvious business rule gets a comment with context.

### Errors

- Never swallow errors with empty catch blocks.
- Throw early, catch at the boundary (API route, CLI entry, etc.).
- Log errors with context: what was being attempted, what inputs.

### Environment

- Never hardcode API keys, URLs, or secrets. Use env vars.
- Add every new env var to `.env.example` with a placeholder value.

### Database

- Never modify existing columns in production tables. Add new columns instead.
- Every schema change gets its own migration file with a descriptive name.

### DRY — but carefully

- Wait until you see a pattern 3 times before extracting it.
- If two pieces of code look similar but serve different business purposes, duplication is fine. Don't abstract across domain boundaries.

### Changes

- For changes touching >3 files, explain what you're changing and why before writing code.
- Do not refactor unrelated code in the same change.
- Do not delete tests to make things pass.
- After changes, run the linter and tests if available. Report results.
