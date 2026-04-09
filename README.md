# GTM Command Center

An autonomous job-search agent that discovers roles, scores them against your profile, researches decision-makers, drafts personalized cold emails, and queues everything for one-click approval. You review and send — the system handles everything else.

## How It Works

The core loop runs daily on a cron. Each stage feeds the next, with every opportunity tracked through a single pipeline:

```
  AUTONOMOUS (runs daily at 10 AM UTC)
  ─────────────────────────────────────────────────────────────────────

  ┌─────────┐    ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌─────────┐
  │DISCOVER │───>│  SCORE  │───>│ RESEARCH │───>│ ENRICH  │───>│  DRAFT  │
  │         │    │         │    │          │    │         │    │         │
  │ JSearch │    │Claude AI│    │Exa People│    │Exa Email│    │Claude AI│
  │  API    │    │ 0–100   │    │ Search   │    │Discovery│    │2 variants│
  └─────────┘    └────┬────┘    └──────────┘    └─────────┘    └────┬────┘
                      │                                             │
                      │ < threshold                                 │
                      v                                             v
                 ┌──────────┐                                 ┌──────────┐
                 │ FILTERED │                                 │  QUEUED  │
                 │ (hidden) │                                 │          │
                 └──────────┘                                 └────┬─────┘
                                                                   │
  HUMAN-IN-THE-LOOP (Today UI)                                     │
  ─────────────────────────────────────────────────────────────────────
                                                                   │
                      ┌────────────────────────────────────────────┘
                      │
                      v
               ┌─────────────┐
               │  YOU REVIEW  │
               │              │
               │ • Read draft │
               │ • Edit draft │
               │ • Switch     │
               │   variant    │
               └──┬───┬───┬───┘
                  │   │   │
         Approve  │   │   │  Flag
          (Send)  │   │   │  (Watch)
                  v   │   v
            ┌──────┐  │  ┌───────────┐
            │ SENT │  │  │ WATCHLIST │──── Exa monitors company
            └──┬───┘  │  └───────────┘    for funding, hires, press
               │      │
               │      v Skip
               │   ┌─────────┐
               │   │ SKIPPED │
               │   └─────────┘
               │
  TRACKING (every 30 min)
  ─────────────────────────────────────────────────────────────────────
               │
               v
          ┌─────────┐
          │ REPLIED? │──── Gmail metadata check (no body reads)
          └────┬────┘
               │ yes
               v
          ┌─────────┐
          │ REPLIED  │
          └─────────┘
```

## Where You Gain Value

**Without this system:** Search job boards manually. Research each company. Find the right person. Find their email. Write a cold email. Send it. Remember to check for replies. Repeat 10x/day.

**With this system:** Open the Today page. Review pre-scored opportunities with ready-to-send emails drafted in your voice. Click approve. Done.

The pipeline compresses ~2 hours of daily manual work into a 5-minute review session:

| Stage    | What happens                                                                 | Time saved                    |
| -------- | ---------------------------------------------------------------------------- | ----------------------------- |
| Discover | Searches JSearch API across your configured queries/locations                | ~20 min of job board browsing |
| Score    | Claude AI scores each role 0-100 against your profile, auto-filters low fits | ~15 min of reading JDs        |
| Research | Exa Websets finds the CEO or hiring manager at each company                  | ~20 min of LinkedIn digging   |
| Enrich   | Exa Websets discovers their work email (retries up to 3x across runs)        | ~15 min of email hunting      |
| Draft    | Claude AI writes 2 personalized email variants using your outreach style     | ~30 min of email writing      |
| Queue    | Everything lands in Today for one-click approve/skip/flag                    | You just review               |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Vercel                               │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Cron Jobs   │  │  App Router │  │  Server Actions     │ │
│  │              │  │             │  │                     │ │
│  │ /pipeline    │  │ Today   (/) │  │ approve / skip      │ │
│  │  daily 10AM  │  │ History     │  │ flag / edit draft   │ │
│  │ /replies     │  │ Watchlist   │  │ trigger pipeline    │ │
│  │  every 30min │  │ Settings    │  │ update config       │ │
│  │ /watchlist   │  │             │  │                     │ │
│  │  daily 11AM  │  │             │  │                     │ │
│  └──────┬───────┘  └──────┬──────┘  └──────────┬──────────┘ │
│         │                 │                     │           │
│         └────────┬────────┴─────────────────────┘           │
│                  │                                          │
│         ┌────────v────────┐                                 │
│         │ Pipeline Runner │                                 │
│         │                 │                                 │
│         │ discover→score→ │                                 │
│         │ research→enrich │                                 │
│         │ →draft→queue    │                                 │
│         └────────┬────────┘                                 │
│                  │                                          │
└──────────────────┼──────────────────────────────────────────┘
                   │
      ┌────────────┼────────────────┐
      │            │                │
      v            v                v
┌──────────┐ ┌──────────┐   ┌────────────┐
│ Supabase │ │   Exa    │   │  External  │
│          │ │ Websets  │   │   APIs     │
│ Postgres │ │          │   │            │
│ Auth     │ │ People   │   │ JSearch    │
│ RLS      │ │ Email    │   │ Claude AI  │
│          │ │ Monitors │   │ Gmail API  │
└──────────┘ └──────────┘   └────────────┘
```

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Database**: Supabase (Postgres + Auth + RLS)
- **AI**: Claude API via AI SDK for scoring + drafting
- **Email Discovery**: Exa Websets (people search + enrichment)
- **Email Send**: Gmail API (OAuth 2.0, PKCE, encrypted refresh tokens)
- **Job Discovery**: JSearch API
- **Deployment**: Vercel (cron jobs, Fluid Compute, 300s function timeout)

## Pages

| Page                         | Purpose                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| **Today** (`/`)              | Daily queue — review scored opportunities, approve/skip/flag, send emails   |
| **History** (`/history`)     | All past opportunities — filterable by status, company, score range         |
| **Watchlist** (`/watchlist`) | Monitored companies with Exa alerts for funding, hires, press               |
| **Settings** (`/settings`)   | Score threshold, search queries/locations, daily send cap, Gmail connection |

## Cron Schedules

| Endpoint              | Schedule        | Purpose                                    |
| --------------------- | --------------- | ------------------------------------------ |
| `/api/cron/pipeline`  | Daily 10:00 UTC | Run full pipeline for all configured users |
| `/api/cron/watchlist` | Daily 11:00 UTC | Ingest Exa watchlist alerts                |
| `/api/cron/replies`   | Every 30 min    | Check Gmail threads for replies            |

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

### Required Environment Variables

| Variable                               | Used by                           | Notes                                    |
| -------------------------------------- | --------------------------------- | ---------------------------------------- |
| `NEXT_PUBLIC_APP_URL`                  | OAuth redirects                   | `http://localhost:3000` for dev          |
| `NEXT_PUBLIC_SUPABASE_URL`             | Auth + DB                         | Supabase project URL                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth (client)                     | Supabase anon key                        |
| `SUPABASE_SERVICE_ROLE_KEY`            | Pipeline + server actions         | Supabase service role key                |
| `ANTHROPIC_API_KEY`                    | Scoring + drafting                | Claude API                               |
| `EXA_API_KEY`                          | Research + enrichment + watchlist | Exa Websets API                          |
| `RAPIDAPI_KEY`                         | Job discovery                     | JSearch API via RapidAPI                 |
| `CRON_SECRET`                          | Cron auth                         | Bearer token for `/api/cron/*` endpoints |
| `GOOGLE_CLIENT_ID`                     | Gmail OAuth                       | Google Cloud Console                     |
| `GOOGLE_CLIENT_SECRET`                 | Gmail OAuth                       | Google Cloud Console                     |
| `TOKEN_ENCRYPTION_KEY`                 | Gmail token storage               | 32-byte hex key for AES-256-GCM          |

### Seed Data (Omar-specific)

`npm run seed` imports Omar's memory docs, evaluations, research, and outreach history into Supabase. This script is hard-coded to Omar's account and will fail for other users. Skip it unless you're Omar.

## Key Directories

```
src/
├── app/(app)/              # Authenticated pages (Today, History, Watchlist, Settings)
├── app/api/cron/           # Vercel cron endpoints (pipeline, replies, watchlist)
├── app/api/pipeline/       # Manual pipeline trigger
├── app/api/auth/gmail/     # Gmail OAuth flow
├── lib/pipeline/           # Pipeline runner + steps (discover, score, research, enrich, draft)
├── lib/pipeline/steps/     # Individual pipeline stages with per-opportunity error isolation
├── lib/integrations/       # Gmail client, token encryption
├── lib/ai/                 # Claude API wrapper
└── components/             # Shared UI (PageHeader, AppShell, Sidebar, CommandPalette)
```
