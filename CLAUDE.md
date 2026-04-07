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
│       ├── settings/       # Pipeline config + Gmail connect/disconnect
│       ├── actions.ts      # Today actions: trigger pipeline, approve, skip, flag
│       ├── analysis/       # Kept detail pages; legacy list/intake routes redirect
│       ├── research/       # Kept report detail pages; legacy list/new routes redirect
│       └── _components/    # OpportunityCard, TodayClient, EmailVariantPicker
│   └── api/
│       ├── auth/gmail/     # Gmail OAuth start + callback
│       ├── cron/pipeline/  # Daily autonomous pipeline cron
│       ├── cron/replies/   # Reply tracking cron
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
