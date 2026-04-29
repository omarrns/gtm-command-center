# CLAUDE.md — GTM Command Center

## What This Is

A browser-based autonomous job-search agent. It discovers roles, scores them, researches contacts, enriches emails, drafts outreach, queues opportunities for approval, sends approved emails through Gmail, and tracks replies. Single-user tool, not a product for others.

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
│   ├── (public)/login/         # Login form (unauth)
│   └── (app)/
│       ├── layout.tsx          # Auth gate → AppShell
│       ├── page.tsx            # Today queue (job_seeker persona)
│       ├── actions.ts          # Today: trigger, approve, skip, flag, manual-apply
│       ├── dev-actions.ts      # Dev-only helpers (persona toggle, etc.)
│       ├── _actions/           # Cross-route server actions (e.g. update-icp-rubric)
│       ├── _components/        # OpportunityCard, AccountCard, TodayClient, IcpDashboard
│       ├── _loaders/           # Shared data loaders (today-queue, today-metrics). Per-route loaders live under `<route>/_loaders/` (e.g. `analytics/_loaders/analytics-data.ts`).
│       ├── accounts/           # GTM persona: pipeline-promoted accounts
│       ├── activate/           # First-run JSearch activation
│       ├── analysis/           # JD/company analyses (detail + intake)
│       ├── analytics/          # Pipeline + content analytics
│       ├── calls/              # Sales-call browse/inspect
│       ├── coaching/           # Career-coach skill UI
│       ├── dev/                # Dev/admin debug page (profiles, pipeline_config, onboarding_interviews)
│       ├── history/            # Sent/skipped opportunities
│       ├── icp/                # ICP rubric editor (GTM persona)
│       ├── memory/             # memory_documents browse/edit
│       ├── onboard/
│       │   ├── page.tsx
│       │   ├── actions.ts                  # Manual wizard step actions
│       │   ├── interview-actions.ts        # Streaming-interview state transitions
│       │   ├── extraction-actions.ts       # in_progress → review (uses orchestrator state for agentic templates)
│       │   ├── story-actions.ts            # review ↔ story_review (agentic templates only)
│       │   ├── artifact-actions.ts         # Upload/delete artifacts
│       │   ├── get-or-create-interview.ts  # Active-row resolver, scoped by (user_id, template_id)
│       │   ├── switch-persona.ts           # Abandon prior + create new + reassign artifacts
│       │   ├── confirm-logic.ts            # performConfirm(svc, userId, …) — testable seam
│       │   └── _components/                # onboard-router, interview-client, review-client, story-client, artifact-input, persona-picker
│       ├── outreach/           # Standalone outreach drafts
│       ├── research/           # Research reports (detail + new)
│       ├── settings/
│       ├── trail/              # Career-coach TRAIL.md viewer
│       ├── trends/             # JSearch trend dashboard
│       ├── watchlist/
│       └── workspace-tools/    # Misc dev/ops actions
│   └── api/
│       ├── auth/gmail/                 # OAuth start + callback
│       ├── activation/{search,accounts}/
│       ├── cron/pipeline/              # job_seeker pipeline (workflow.ts)
│       ├── cron/dormant-discover/      # GTM weekly Exa sweep over ICP rubric
│       ├── cron/replies/
│       ├── cron/watchlist/
│       ├── jobs/[id]/                  # Background-job status polling
│       ├── onboard/{chat,artifacts,story/stream}/
│       ├── pipeline/run/               # Manual pipelineWorkflow trigger
│       ├── webhooks/theirstack/        # Real-time GTM job inflow (HMAC-verified)
│       └── worker/claim/               # Background-job claim endpoint
├── components/
│   ├── app-shell.tsx
│   ├── sidebar-nav.tsx         # Desktop aside + mobile Sheet (intentionally custom)
│   ├── top-bar.tsx
│   ├── command-palette.tsx, lazy-command-palette.tsx  # Intentionally custom (⌘K motion)
│   ├── page-header.tsx, list-item.tsx, empty-state.tsx, detail-header.tsx
│   ├── dev-persona-toggle.tsx, tag-input.tsx, theme-provider.tsx
│   ├── ai-elements/            # VENDORED from Vercel AI Elements (prompt-input.tsx, message.tsx, conversation.tsx, loader.tsx). Don't hand-refactor; re-vendor from upstream.
│   └── ui/                     # shadcn/ui (owned source)
└── lib/
    ├── utils.ts                # cn(), formatRelativeTime(), assertEnv()
    ├── logger.ts               # createLogger({ runId, scope, … }) — use for all background work
    ├── ai/                     # anthropic.ts (runClaudeJson/Text), calls.ts (runGenerateObject + ai_calls capture), exa.ts, firecrawl.ts
    ├── calls/                  # Sales-call data + types
    ├── trends/                 # Trend dashboard data
    ├── supabase/               # client.ts, server.ts, service.ts, types.ts (row types are source of truth)
    ├── integrations/           # gmail.ts, crypto.ts (AES-256-GCM token storage), theirstack.ts
    ├── pipeline/
    │   ├── workflow.ts                 # LIVE orchestrator (Vercel Workflow durable). Edit this, not runner.ts.
    │   ├── runner.ts                   # LEGACY — kept only because gtm-runner.ts imports `PipelineRunResult` type. Do not add logic.
    │   ├── gtm-runner.ts               # GTM persona pipeline entry (discover-accounts → score-accounts; no draft yet)
    │   ├── opportunities.ts            # Stage transitions + atomic claiming
    │   ├── scoring.ts                  # job_seeker per-opportunity scoring (analysisSchema, strict)
    │   ├── scoring-account.ts          # GTM per-account scoring (icpAccountAnalysisSchema)
    │   ├── scoring-profile.ts          # Dispatcher → template.normalizeScoringProfile
    │   ├── onboarding.ts               # isOnboardingComplete() — template-aware via USER_TYPE_TO_TEMPLATE
    │   ├── activation.ts, activation-accounts.ts
    │   ├── jsearch.ts, watchlist.ts, people-search.ts
    │   ├── icp-to-theirstack-filters.ts, icp-webset-query.ts
    │   └── steps/                      # job_seeker: discover/score/research/enrich/draft. GTM: discover-accounts, discover-dormant, score-accounts.
    ├── onboarding/
    │   ├── interview-prompt.ts, extraction-prompt.ts, story-prompt.ts
    │   ├── extraction.ts               # runExtractionFromTranscript<X>(messages, template) — template-generic
    │   ├── icp-prompts.ts, icp-schemas.ts, insights-schema.ts
    │   ├── markdown.ts, transcript.ts
    │   ├── templates/                  # InterviewTemplate registry — types.ts, index.ts, artifact-kind.ts, job-search/ (dir), icp-definition.ts (+ icp-definition/ helpers)
    │   ├── orchestrator/               # Agentic-mode state, Opus dimension inference (run.ts), to-confirm-edits adapter, types
    │   └── artifacts/                  # ingest.ts (URL/file → normalized markdown), reassign.ts (persona-switch retention)
    ├── skills/
    │   ├── sender-identity.ts          # extractSenderIdentity(ctx, displayName) → SenderIdentity
    │   ├── context.ts                  # loadMemoryContext()
    │   └── prompts/                    # All prompt builders, accept SenderIdentity
    └── jobs/                           # Background-job worker + handlers (career-coach, full-analysis, company-fit-analyzer, people-research)
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

### Dual-Persona Routing

`profiles.user_type` (`job_seeker` | `gtm`) splits the app into two pipelines that share the same `opportunities` table and most infrastructure but diverge on entry, scoring, and surface UI. There is no central dispatcher — routing happens at the API/page boundary.

| Concern             | job_seeker                                 | gtm                                                                                                 |
| ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Entry / cron        | `/api/cron/pipeline` → `pipelineWorkflow`  | `/api/cron/dormant-discover` (weekly Exa sweep) + `/api/webhooks/theirstack` (real-time `job.new`)  |
| Discover            | `steps/discover.ts` (JSearch)              | `steps/discover-accounts.ts` (TheirStack), `steps/discover-dormant.ts` (Exa over rubric)            |
| Score               | `scoring.ts` → `analysisSchema`            | `scoring-account.ts` → `icpAccountAnalysisSchema` (called per-account from `gtm-runner` or webhook) |
| Opportunity source  | `jsearch`                                  | `theirstack`, `exa-dormant`                                                                         |
| Onboarding template | `job_search`                               | `icp_definition` (agentic; uses orchestrator + artifacts)                                           |
| Pipeline_config     | search_queries, locations, score_threshold | + `company_domain`, `trigger_signals`, `buyer_personas`, `icp_rubric`                               |
| Surface UI          | Today (`/`), History, Watchlist            | `/accounts` (never-auto-remove rule), `/icp` (rubric editor)                                        |

`gtm-runner.ts` is the GTM lane's entry point but is currently only called by the legacy `runner.ts`. `pipelineWorkflow` does not branch on `user_type` — the GTM persona's recurring/realtime entry points are the dormant-discover cron and the TheirStack webhook, not `/api/cron/pipeline`.

GTM account retention rule: `/accounts` shows every pipeline-promoted account except `discovered`, `filtered`, and explicit user dismissals (`skipped`). Downstream stages such as `researched`, `needs_contact`, `enriched`, `queued`, `sent`, and `replied` must not auto-remove an account from `/accounts`; only user actions like skip/flag remove it.

### Onboarding Interview State Machine

```
                        ┌──────────────────────────────────────────┐
                        │                                          │
                        ▼                                          │
[create] ──────► in_progress ─────► extracting ─────► review ─────►│ confirmed
                    ▲   │              │                │ ▲        ▲
                    │   │              │                │ │        │
                    │   │ (rollback    │                │ │        │
                    │   │  on failure) │                │ │        │
                    │   └──────────────┘                ▼ │        │
                    │                              story_review ───┘
                    │                                   │
                    │ (backToInterview from review)     │
                    └───────────────────────────────────┘

Any status ─────► abandoned   (terminal; switch persona or explicit abandon)
```

Transitions and the file:function responsible for each:

```
[create]      → in_progress     get-or-create-interview.ts: getOrCreateInterviewAction (insert)
[create]      → in_progress     switch-persona.ts: switchPersonaAction (insert; abandons prior)
in_progress   → in_progress     api/onboard/chat/route.ts: POST handler
                                  (sets ready_for_extraction=true on completionMarker
                                   or maxAssistantMessages cap; status unchanged)
in_progress   → extracting      interview-actions.ts: extractAndReviewAction
                                  (atomic compare-and-set gated on status='in_progress')
                                Auto-triggered by onboard-router.tsx when
                                  status='in_progress' && ready_for_extraction=true
extracting    → review          interview-actions.ts: extractAndReviewAction (on success)
extracting    → in_progress     interview-actions.ts: extractAndReviewAction (rollback on failure)
review        → in_progress     interview-actions.ts: backToInterviewAction
                                  (clears ready_for_extraction)
review        → story_review    interview-actions.ts: startStoryPhaseAction
                                  (agentic templates only; gated on template.agenticMode)
story_review  → review          interview-actions.ts: backToReviewFromStoryAction
review        → confirmed       confirm-logic.ts: performConfirm
                                  (called by interview-actions.ts: confirmInterviewAction)
story_review  → confirmed       confirm-logic.ts: performConfirm
*             → abandoned       interview-actions.ts: abandonInterviewAction
*             → abandoned       switch-persona.ts: switchPersonaAction (abandons prior row)
```

- `ready_for_extraction` is a boolean flag, not a status — it lets the streaming chat route signal "interview is done" without holding the DB transaction needed to flip status. The router observes the flag and triggers the actual `in_progress → extracting` transition from the client.
- The `extracting` state is held briefly inside one server action; if the process dies, the rollback path returns the row to `in_progress` so the user can retry.
- `/onboard` routes purely on `interview.status` — there is no `/onboard/review` or `/onboard/story` route.

### Database Tables

| Table                   | Purpose                                                                                                                                                                                               | Access                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `profiles`              | `user_type` (`job_seeker` \| `gtm`), display name, enabled flag, first-confirm timestamp. Determines which persona pipeline runs.                                                                     | RLS by user.                                       |
| `pipeline_config`       | Search queries, locations, score threshold, daily send cap, `activation_completed_at`. GTM-only fields (`company_domain`, `trigger_signals`, `buyer_personas`, `icp_rubric`) coexist on the same row. | Client: SELECT only. Mutations via server actions. |
| `opportunities`         | Pipeline stage, score, drafts, Gmail IDs. Dedupes by `(user_id, source, external_id)`. `source` includes `jsearch`, `theirstack`, `exa-dormant`.                                                      | RLS by user. Cross-table ownership trigger.        |
| `gmail_credentials`     | Encrypted refresh tokens                                                                                                                                                                              | Service-role only. No client RLS.                  |
| `watchlist`             | Monitored companies + Exa Webset IDs                                                                                                                                                                  | RLS by user.                                       |
| `watchlist_alerts`      | Exa Webset items, deduped by `source_item_id`                                                                                                                                                         | RLS by user.                                       |
| `user_scoring_profiles` | Derived scoring fields + user-editable weights (0.5-2.0). `icp_rubric` JSONB populated by GTM persona (icp_definition normalizer).                                                                    | RLS by user.                                       |
| `onboarding_interviews` | Interview state, messages, extracted data, `template_id`, `template_version`, `orchestrator_state` (agentic mode). Partial unique index: one active row per `(user_id, template_id)`.                 | Client: SELECT only. Mutations via service-role.   |
| `onboarding_artifacts`  | User-uploaded URLs/files/text, normalized to markdown. `interview_id` is `ON DELETE SET NULL` so artifacts survive interview deletion / persona switch.                                               | RLS by user.                                       |
| `memory_documents`      | User profile, positioning, outreach style, dealbreakers, interview insights                                                                                                                           | RLS by user.                                       |
| `ai_calls`              | Best-effort capture of every model call (params, prompt, output, latency) for replay/inspection. Capture failure must not break the actual call.                                                      | Service-role only. No client RLS.                  |

Migrations live in `supabase/migrations/`. TypeScript row types in `src/lib/supabase/types.ts`.

### Auth and Security

- All cron endpoints: `GET`, bearer `CRON_SECRET`, fail-closed if missing/mismatched.
- Manual pipeline trigger: `POST`, authenticated with `requireUser()`.
- Gmail OAuth: PKCE + signed state + nonce cookies. Scopes: `gmail.send`, `gmail.metadata`.
- Refresh tokens: AES-256-GCM encrypted in `gmail_credentials`.
- `pipeline_config` client-readable but not client-writable (SELECT-only RLS).

### Cron Schedules (owned by `vercel.json`)

| Route                        | Schedule             | Purpose                                                                                            |
| ---------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `/api/cron/pipeline`         | `0 4,10,16,22 * * *` | job_seeker pipeline (workflow.ts): discover → score → research → enrich → draft                    |
| `/api/cron/replies`          | `*/30 * * * *`       | Check Gmail threads for replies, advance `sent → replied`                                          |
| `/api/cron/watchlist`        | `0 11 * * *`         | Ingest Exa Webset alerts                                                                           |
| `/api/cron/dormant-discover` | `0 12 * * 1`         | GTM weekly Exa sweep over the user's ICP rubric (no hiring signal); scores via `runScoreAccounts`. |

Real-time (not cron): `POST /api/webhooks/theirstack?user=<uuid>` — HMAC-SHA256 signed `job.new` deliveries from a TheirStack saved search. Runs `scoreOneAccount` inline so a hot match shows up in `/accounts` within seconds.

`maxDuration` is set per route based on whether the route does the work itself or dispatches it:

| Route                        | `maxDuration` | Why                                                                                                                                                                                                                                     |
| ---------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/pipeline`         | `60`          | Fire-and-forget — dispatches one Vercel Workflow per user (`workflow/api`'s `start()`) and returns. Each user's workflow has its own durability/retry, so the cron handler only needs to live long enough to insert N workflow records. |
| `/api/cron/replies`          | `120`         | Inline — iterates sent opportunities, reads Gmail thread metadata. Bounded by the number of in-flight threads.                                                                                                                          |
| `/api/cron/watchlist`        | `120`         | Inline — iterates active watchlists, polls Exa Websets.                                                                                                                                                                                 |
| `/api/cron/dormant-discover` | `300`         | Inline — Exa search + per-account scoring across the user's full ICP rubric; needs the long ceiling.                                                                                                                                    |

### Send Flow (Safety-Critical)

1. `reserve_send_slot` atomically moves `queued → sending` under daily send cap.
2. Gmail API sends; stores `gmail_thread_id`, `gmail_message_id`, `sent_at`.
3. **After Gmail returns IDs, NEVER revert to `queued`.** Post-send DB failures return a controlled reconciliation error to avoid duplicate sends.
4. Headers sanitized, subject MIME-encoded before send.
5. Reply tracking uses metadata/minimal thread reads only — never reads message bodies.

### Onboarding Flow

- `isOnboardingComplete()` in `src/lib/pipeline/onboarding.ts` resolves the user's template via `USER_TYPE_TO_TEMPLATE` (`profiles.user_type` → template id) and delegates to `template.isOnboardingComplete(svc, userId)`. job_seeker checks three records (`user_profile` doc, `pipeline_config` row, `feedback_outreach_style` doc); icp_definition has its own completion shape.
- Today page redirects to `/onboard` if incomplete (`DEV_SKIP_ONBOARDING=true` bypasses).
- Primary path: AI interview (`InterviewClient` → `ReviewClient` → confirm). Manual wizard is escape hatch.
- Interview streams via `/api/onboard/chat`; model, prompt, tools, caps, thresholds, and completion marker all come from the active `InterviewTemplate` (see subsection below).
- Extraction uses the template's `extractionModel` / `extractionSchema` / `extractionSystemPrompt` via `generateObject`.
- Confirm iterates `template.outputs` and dispatches per output type (`memory_doc` / `pipeline_config` / `scoring_profile_normalize`), then marks interview `confirmed`. Every output is an idempotent upsert.
- `topics_covered` controls which extracted values overwrite existing settings on refresh.
- Post-confirm routes to `/activate` (first-time) or `/settings` (refresh).

### Interview Template Abstraction

- `src/lib/onboarding/templates/` holds the `InterviewTemplate` registry. `types.ts` defines the interface; `job-search/index.ts` and `icp-definition.ts` are the current templates; `index.ts` exposes `getTemplate(id)`, `getDefaultTemplate()`, and `toClientTemplate(template)`.
- An `InterviewTemplate` co-locates everything template-specific: topics, `systemPrompt(ctx)`, `tools`, opening messages, `maxAssistantMessages` / `wrapUpThreshold` / `completionMarker` / `completionTopicThreshold`, chat + extraction models, `extractionSchema` (zod), `editsSchema` (zod), and an ordered `outputs[]` array with per-output `transform({ edits, extraction })`.
- `onboarding_interviews.template_id` + `template_version` stamp every row. `getOrCreateInterviewAction` scopes its active-interview SELECT by `(user_id, template_id)` so future templates can have concurrent active interviews.
- **Client boundary:** raw `InterviewTemplate` is not serializable (zod schemas, tool definitions, function fields). RSC pages pass `ClientInterviewTemplate` — a plain-data projection of `{ id, topics, topicLabels, openingMessage, refreshOpeningMessage }` — to `InterviewClient` / `ReviewClient`. Use `toClientTemplate()` to produce it.
- **Confirm seam:** `src/app/(app)/onboard/confirm-logic.ts` exports `performConfirm(svc, userId, interviewId, edits)` for testability. `confirmInterviewAction` is a thin server-action wrapper around it. Test via `scripts/test-onboarding-confirm.ts`.
- **Adding a template:** one file in `templates/` + one entry in `REGISTRY` + widen the `InterviewTemplateId` union + route (e.g. `/onboard/icp` or `/onboard?template=icp`). No other files should need to change in the streaming / extract / confirm code paths.
- **Generalization status (job_search + icp_definition both shipping):**
  - `isOnboardingComplete()` — template-aware dispatcher. `src/lib/pipeline/onboarding.ts:31`.
  - `normalizeScoringProfile()` — template-aware dispatcher → `template.normalizeScoringProfile`. `src/lib/pipeline/scoring-profile.ts`.
  - `ReviewClient` — switches on `clientTemplate.id`, renders `ReviewIcp` or `ReviewJobSearch`. `src/app/(app)/onboard/_components/review-client.tsx:43`.
  - `runExtractionFromTranscript<X>(messages, template)` — template-generic. `src/lib/onboarding/extraction.ts`.
- **Phase 3 (`positioning_rubric`)** is not yet started — adding it should still follow the "Adding a template" recipe above.

### Agentic Onboarding (Orchestrator + Artifacts)

A template opts into agentic mode by setting `agenticMode: true` and declaring `dimensions`. Currently `icp_definition` uses this; `job_search` does not. Two subsystems back it — both are documented inline below rather than in a separate architecture doc.

**Artifacts (`src/lib/onboarding/artifacts/`)** — user-uploaded URLs, files, or pasted text. `ingest.ts` normalizes each one to markdown (Firecrawl for URLs, `unpdf` for PDFs) and writes a row to `onboarding_artifacts`. `reassign.ts` provides two primitives: `reassignArtifacts(svc, userId, fromInterviewId, toInterviewId)` for the persona-switch UI flow, and `claimOrphanedArtifacts(svc, userId, toInterviewId)` as the safety-net for artifacts whose interview was already deleted. The FK is `ON DELETE SET NULL` so user-uploaded content survives interview churn.

**Orchestrator (`src/lib/onboarding/orchestrator/`)** — agentic-mode state machine that runs Opus across the user's artifacts to infer per-dimension values _before_ the chat starts. `run.ts` builds a closed-object analysis schema from `template.dimensions` and writes the result to `onboarding_interviews.orchestrator_state`. Each dimension lands as `{ value, summary, confidence, provenance[] }` with one of five statuses (`unknown` / `inferred` / `needs_question` / `answered` / `confirmed`). The chat then asks only about dimensions still under `needs_question`. `to-confirm-edits.ts` adapts orchestrator state into the `ConfirmEdits` shape that `performConfirm` consumes, so the agentic and non-agentic paths share the same confirm seam. `types.ts` defines the public shape (`OrchestratorState`, `OrchestratorStatus`, `DimensionStatus`).

The streaming chat route still serves both modes — agentic templates get a `systemPrompt(ctx)` with the orchestrator state injected so the model knows what's already inferred.

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
- **Surfaces use `<Card>` from `src/components/ui/card.tsx`.** The `surface` / `surface-muted` utilities in `globals.css` are deprecated — do not add new call sites. For a muted variant, use `<Card className="bg-muted ...">`.
- `QueueFilterBar` (`src/app/(app)/_components/queue-filter-bar.tsx`) owns Min/Max Score + Company search. Pass a `leftSlot` for stage / window / tier controls. Optional `onApply` switches to server-roundtrip mode (form submit + Apply button); omit it for live client-side filtering.
- `PageHeader` on every list page. `DetailHeader` on every detail page. `EmptyState` for zero items. `<Alert>` (with optional `<RefreshCw className="animate-spin">` for running states) for status banners.
- `command-palette.tsx` and `sidebar-nav.tsx` are **intentionally custom** — they own spring motion, LayoutGroup active-pill, and ⌘K / ⌘B shortcuts. Do not swap them for shadcn `command` / `sidebar` without an explicit ask.
- Background jobs: server action enqueues → client polls via `useJobPoll(jobId)` → `router.refresh()` on completion.
- Toast: `toast` from `"sonner"`.
- Sidebar: desktop `w-60` aside, mobile Sheet. State in `AppShell`.
- `OpportunityCard` is unified across Activate, Today, and History views.

## Design System

Implementation companion to `DESIGN.md` (design language, personality, principles).

### Tokens (in `globals.css`)

**App tokens** (via `var()`): `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-surface`, `--color-surface-muted`, `--color-blue`, `--color-blue-muted`, `--color-success`, `--color-warning`, `--color-danger`, `--color-border-strong`.

**shadcn tokens** (via Tailwind): `--background`, `--foreground`, `--card`, `--muted`, `--primary`, `--border`, etc.

Both respond to `.dark` class. **Never use `--color-accent` for blue** — that's shadcn's hover state token. Our blue is `--color-blue`.

### Component Classes (globals.css)

Only `.surface` and `.surface-muted` remain — container utilities, not primitives. All button / input / badge / banner styling lives in the shadcn primitives under `src/components/ui/`.

## Scripts

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm seed             # Run all imports
pnpm onboard:reset    # Delete all onboarding data
pnpm onboard:fixture  # Seed: --state=partial|complete|empty --interview-state=transcript|review|ready

pnpm test                 # Umbrella — runs 16 test:* scripts in sequence (correctness, extraction, confirm, icp-confirm, persona-switch, pipeline-regression, etc.)
pnpm test:correctness       # Recent pipeline correctness guardrails
pnpm test:extraction        # Opus extraction on transcript fixture (template-parameterized)
pnpm test:onboarding-confirm # DB-integration regression for the confirm path
pnpm test:sender-identity   # Verify prompt de-Omarification
# Full list of `test:*` scripts is in package.json — `scripts/test-pipeline-path.ts` and `scripts/test-watchlist-live.ts` exist but are not wired into `pnpm test` (manual-only).
```

## Plans

When creating a plan, also write a human-readable copy to `.claude/plans/<feature-slug>.md` where the slug describes the build (e.g., `phase-2-icp-template.md`, `fix-scoring-weights.md`). Use the same content as the plan. The CLI may generate its own random-named file alongside it — that's fine, ignore it.

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
- Every new env var gets added to `.env.example` with a comment.
- Never log secrets, tokens, or API keys, even in error messages.

### Database

- Never modify existing production columns. Add new columns instead.
- Every schema change gets its own migration file in `supabase/migrations/`.
- No raw SQL in pipeline files. Named query functions live in dedicated query files.

### Prompts

- Prompts are business logic. Version and review them like code.
- All prompt builders live in `src/lib/skills/prompts/`. Prompt builders accept `SenderIdentity`; call sites derive it via `extractSenderIdentity(ctx, displayName)` instead of hardcoding sender names, companies, or brands.
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
