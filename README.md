# GTM Command Center

A browser-based autonomous job-search agent. It discovers roles, scores them against your profile, researches decision-makers, drafts personalized cold emails, and queues everything for one-click approval. Built for a single user — not a product.

The app supports two personas that share the same infrastructure but run separate pipelines:

- **Job Seeker** — discovers inbound job postings, scores them, finds contacts, drafts outreach, and sends approved emails through Gmail.
- **GTM** — tracks target accounts from TheirStack hiring signals and Exa company sweeps, scores them against an ICP rubric, and surfaces warm accounts for outreach.

---

## Job Seeker Pipeline

Runs automatically four times a day (4, 10, 16, 22 UTC) via Vercel Workflow.

```text
discover → score → research → enrich → draft → queued
                                                  ↓
                                    approve (send via Gmail)
                                    skip
                                    flag → watchlist
```

| Stage    | What happens                                                               |
| -------- | -------------------------------------------------------------------------- |
| Discover | Pulls fresh job postings from JSearch across configured queries/locations  |
| Score    | Claude scores each role 0–100 against your profile; low scores are dropped |
| Research | Exa Websets finds the CEO or hiring manager at each company                |
| Enrich   | Exa Websets discovers a work email (retries up to 3× across runs)          |
| Draft    | Claude writes 2 personalized email variants in your outreach voice         |
| Queue    | Everything lands in Today for one-click approve/skip/flag                  |

Approved emails go out via Gmail API. Reply tracking runs every 30 minutes via metadata-only thread reads (no body access).

---

## GTM Pipeline

Two entry points feed the same accounts table:

- **TheirStack webhook** (`/api/webhooks/theirstack`) — real-time `job.new` deliveries from a saved search. Scores the account inline so a hot match shows up in seconds.
- **Dormant-discover cron** (Mondays, 12 UTC) — weekly Exa sweep across your ICP rubric to surface companies that haven't posted a job but match your buyer profile.

Both score via `scoring-account.ts` against an `icpAccountAnalysisSchema`. Scored accounts appear in `/accounts` and are never auto-removed.

---

## Pages

| Page                                     | Persona    | Purpose                                                                            |
| ---------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| **Today** (`/`)                          | Job Seeker | Daily review queue — approve/skip/flag opportunities, send emails                  |
| **Accounts** (`/accounts`)               | GTM        | Pipeline-promoted accounts sorted by ICP score                                     |
| **ICP** (`/icp`)                         | GTM        | Edit your ICP rubric — buyer personas, trigger signals, company criteria           |
| **Analytics** (`/analytics`)             | Both       | Pipeline funnel + content performance charts                                       |
| **History** (`/history`)                 | Job Seeker | All past opportunities filtered by status, company, score range                    |
| **Watchlist** (`/watchlist`)             | Job Seeker | Monitored companies with Exa alerts for funding, hires, press                      |
| **Analysis** (`/analysis`)               | Both       | JD and company analyses — detail view + intake form                                |
| **Research** (`/research`)               | Both       | Research reports per company                                                       |
| **Calls** (`/calls`)                     | GTM        | Sales-call browse and inspection                                                   |
| **Outreach** (`/outreach`)               | Both       | Standalone outreach draft composer                                                 |
| **Trends** (`/trends`)                   | Job Seeker | JSearch trend dashboard                                                            |
| **Coaching** (`/coaching`)               | Both       | Career-coach skill UI                                                              |
| **Trail** (`/trail`)                     | Both       | Career-coach TRAIL.md viewer                                                       |
| **Memory** (`/memory`)                   | Both       | Browse and edit memory documents                                                   |
| **Settings** (`/settings`)               | Both       | Score threshold, search config, daily send cap, Gmail connection                   |
| **Onboarding** (`/onboard`)              | Both       | AI interview → extraction → review → confirm flow (template-specific per persona)  |
| **Activation** (`/activate`)             | Job Seeker | First-run JSearch activation (fast scoring pass, redirects to Today on completion) |
| **Dev** (`/dev`)                         | Both       | Debug page — profiles, pipeline_config, onboarding interviews                      |
| **Workspace Tools** (`/workspace-tools`) | Both       | Miscellaneous ops actions                                                          |

---

## Onboarding

New users complete a structured AI interview before the pipeline runs. The interview is template-specific per persona and follows a state machine:

```text
in_progress → extracting → review → (story_review) → confirmed
                                         ↑↓
                               back to in_progress at any point
any state → abandoned
```

- `job_search` template: collects user profile, search config, and outreach style. No agentic mode.
- `icp_definition` template: agentic mode. Opus pre-analyzes uploaded artifacts (pitch decks, LinkedIn exports, call notes) to infer ICP dimensions before the chat starts, so the interview only asks about what's still unknown.

After confirmation, the system writes memory documents, pipeline config, and a normalized scoring profile to the database.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                          Vercel                             │
│                                                             │
│  ┌──────────────────┐  ┌──────────────┐  ┌───────────────┐ │
│  │    Cron Jobs      │  │  App Router  │  │Server Actions │ │
│  │                  │  │              │  │               │ │
│  │ /pipeline 4x/day │  │ Today, ICP   │  │ approve/skip  │ │
│  │ /replies 30 min  │  │ Accounts     │  │ flag, draft   │ │
│  │ /watchlist daily │  │ Analytics    │  │ config upsert │ │
│  │ /dormant Mon 12  │  │ Onboarding   │  │               │ │
│  └────────┬─────────┘  └──────┬───────┘  └───────┬───────┘ │
│           │                   │                  │          │
│           └────────────┬──────┴──────────────────┘          │
│                        │                                    │
│              ┌─────────▼──────────┐                         │
│              │  Vercel Workflow   │                         │
│              │  (durable, /user)  │                         │
│              │                   │                          │
│              │ discover→score→   │                          │
│              │ research→enrich   │                          │
│              │ →draft→queue      │                          │
│              └─────────┬─────────┘                          │
└────────────────────────┼───────────────────────────────────┘
                         │
           ┌─────────────┼───────────────┐
           │             │               │
           v             v               v
    ┌──────────┐  ┌──────────┐   ┌────────────┐
    │ Supabase │  │   Exa    │   │  External  │
    │          │  │          │   │   APIs     │
    │ Postgres │  │ Websets  │   │            │
    │ Auth/RLS │  │ People   │   │ JSearch    │
    │          │  │ Email    │   │ TheirStack │
    │          │  │ Monitors │   │ Claude API │
    └──────────┘  └──────────┘   │ Gmail API  │
                                 └────────────┘
```

---

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS v4 (CSS-based config) + shadcn/ui
- **Database**: Supabase (Postgres + Auth + RLS)
- **AI**: Claude API (Opus for extraction/orchestration, Sonnet for scoring/drafting)
- **Job Discovery**: JSearch API (job seeker), TheirStack webhook + Exa (GTM)
- **People/Email**: Exa Websets
- **Email Send**: Gmail API (OAuth 2.0, PKCE, AES-256-GCM encrypted refresh tokens)
- **Pipeline**: Vercel Workflow (durable, per-user)
- **Deployment**: Vercel (Fluid Compute, 300s function timeout)

---

## Cron Schedules

| Endpoint                     | Schedule             | Purpose                                                   |
| ---------------------------- | -------------------- | --------------------------------------------------------- |
| `/api/cron/pipeline`         | `0 4,10,16,22 * * *` | job_seeker pipeline via Vercel Workflow (fire-and-forget) |
| `/api/cron/replies`          | `*/30 * * * *`       | Check Gmail threads for replies                           |
| `/api/cron/watchlist`        | `0 11 * * *`         | Ingest Exa Webset alerts                                  |
| `/api/cron/dormant-discover` | `0 12 * * 1`         | GTM weekly Exa sweep over ICP rubric                      |

---

## Database Tables

| Table                   | Purpose                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `profiles`              | `user_type` (`job_seeker` \| `gtm`), display name, first-confirm timestamp            |
| `pipeline_config`       | Search queries, locations, score threshold, daily send cap. GTM fields coexist.       |
| `opportunities`         | Pipeline stage, score, drafts, Gmail IDs. Deduped by `(user_id, source, external_id)` |
| `watchlist`             | Monitored companies + Exa Webset IDs                                                  |
| `watchlist_alerts`      | Exa Webset items, deduped by `source_item_id`                                         |
| `user_scoring_profiles` | Derived scoring fields + user-editable weights. `icp_rubric` JSONB for GTM.           |
| `onboarding_interviews` | Interview state, messages, extracted data, template + version stamp                   |
| `onboarding_artifacts`  | User-uploaded URLs/files/text normalized to markdown                                  |
| `memory_documents`      | User profile, positioning, outreach style, dealbreakers, insights                     |
| `gmail_credentials`     | Encrypted refresh tokens (service-role only)                                          |
| `ai_calls`              | Best-effort capture of every model call for replay/inspection                         |

---

## Setup

```bash
pnpm install
cp .env.local.example .env.local
pnpm dev
```

### Required Environment Variables

| Variable                               | Used by                         |
| -------------------------------------- | ------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | OAuth redirects                 |
| `NEXT_PUBLIC_SUPABASE_URL`             | Auth + DB                       |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth (client)                   |
| `SUPABASE_SERVICE_ROLE_KEY`            | Pipeline + server actions       |
| `ANTHROPIC_API_KEY`                    | Scoring, drafting, extraction   |
| `EXA_API_KEY`                          | Research, enrichment, watchlist |
| `RAPIDAPI_KEY`                         | JSearch API via RapidAPI        |
| `CRON_SECRET`                          | Bearer token for cron endpoints |
| `GOOGLE_CLIENT_ID`                     | Gmail OAuth                     |
| `GOOGLE_CLIENT_SECRET`                 | Gmail OAuth                     |
| `TOKEN_ENCRYPTION_KEY`                 | 32-byte hex key for AES-256-GCM |
| `THEIRSTACK_API_KEY`                   | GTM persona TheirStack calls    |
| `FIRECRAWL_API_KEY`                    | Artifact URL ingestion          |

### Scripts

```bash
pnpm dev                # Start dev server
pnpm build              # Production build
pnpm test               # Run all test scripts in sequence
pnpm onboard:reset      # Delete all onboarding data
pnpm onboard:fixture    # Seed interview fixture (--state, --interview-state flags)
```
