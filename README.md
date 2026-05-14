# GTM Command Center

**An autonomous career, GTM, and research console.**

It turns job posts, account signals, research, scoring, and outreach into one daily review queue. The agent does the prep work; the operator approves what gets sent.

**Why it matters:** less tab-hopping, more qualified outreach, and no unsupervised email sends.

**Built for:** one operator. This is a personal command center, not a multi-tenant SaaS product.

---

## What It Does

**For job search**

- Finds roles from configured searches.
- Scores each role against the user's profile.
- Researches decision-makers.
- Finds likely work emails.
- Drafts personalized outreach.
- Queues approve, skip, or watchlist decisions.
- Sends only approved emails through Gmail.

**For GTM**

- Tracks accounts from hiring signals and company sweeps.
- Scores fit against an ICP rubric.
- Keeps qualified accounts visible in `/gtm/accounts`.
- Reviews owned YouTube content against the ICP using transcript extraction.

**For research**

- Collects standalone analyst reports in `/research`.
- Keeps the route boundary separate from career and GTM workflows.

---

## The Loop

**Job seeker pipeline**

```text
discover -> score -> research -> enrich -> draft -> queued
                                                   |
                                                   +-> approve -> Gmail send
                                                   +-> skip
                                                   +-> flag -> watchlist
```

Runs four times a day through Vercel Workflow. Gmail reply checks use metadata-only thread reads.

**GTM pipeline**

```text
TheirStack webhook
Weekly Exa sweep
        |
        v
score account -> show in /gtm/accounts -> review for outreach
```

Accounts stay visible unless they are early-stage noise or explicitly skipped.

**Video ICP**

Paste a YouTube URL in `/gtm/video-icp`. The app extracts transcript text, keeps raw comments visible for sanity-check, and generates a synthetic ICP review from the transcript.

---

## Main Screens

| Page             | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `/`              | Redirects to the active mode landing page             |
| `/career`        | Daily job-seeker queue                                |
| `/career/*`      | Career activation, profile, history, watchlist, analytics, analysis detail routes, and compatibility placeholders for deferred career surfaces |
| `/gtm/icp`       | ICP rubric editing, chat, narrative, and changes      |
| `/gtm/accounts`  | GTM account review                                    |
| `/gtm/video-icp` | YouTube transcript review against the ICP             |
| `/gtm/*`         | GTM prospects, messaging, calls, trends, and account activation |
| `/research`      | Standalone analyst workspace and saved reports        |
| `/settings`      | Search config, send cap, threshold, Gmail connection  |
| `/onboard`       | AI interview, extraction, review, and confirmation    |

---

## Architecture

**The app is a Next.js control plane over durable jobs, Supabase state, and external research/send APIs.**

```text
Next.js App Router
  -> Server actions and route handlers
  -> Vercel Workflow pipeline jobs
  -> Supabase Postgres/Auth/RLS
  -> JSearch, TheirStack, Exa, Gmail
  -> Vercel AI Gateway for Claude and Gemini models
```

**Key guardrails**

- Cron endpoints require `CRON_SECRET`.
- Gmail sends require human approval.
- `pipeline_config` is client-readable, not client-writable.
- AI calls route through Vercel AI Gateway.
- Prompt builders live in `src/lib/skills/prompts/`.
- Product routes are grouped by visible mode URL: `/career`, `/gtm`, and `/research`.
- Schema changes live in `supabase/migrations/`.

Full implementation notes live in `docs/agent-reference.md`.

---

## Stack

| Layer     | Choice                                                |
| --------- | ----------------------------------------------------- |
| App       | Next.js 16 App Router, React 19                       |
| UI        | Tailwind CSS v4, shadcn/ui, Geist                     |
| Database  | Supabase Postgres, Auth, RLS                          |
| AI        | Vercel AI SDK v6, Vercel AI Gateway                   |
| Workflows | Vercel Workflow, Fluid Compute                        |
| Data      | JSearch, TheirStack, Exa Websets                      |
| Email     | Gmail API with OAuth 2.0 and encrypted refresh tokens |
| Video     | Vendored yt-llm runtime with `ytdlp-nodejs`           |

---

## Local Setup

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Start from `.env.example`. It separates required runtime keys, local development toggles, and script-only variables.

---

## Useful Commands

```bash
pnpm dev                         # Start local dev
pnpm build                       # Production build
pnpm test                        # Full test suite
pnpm test:correctness            # Pipeline guardrails
pnpm test:approve-send           # Gmail send guardrails
pnpm test:icp-agent-loop         # ICP revision guardrails
pnpm onboard:reset               # Delete onboarding data
pnpm onboard:fixture             # Seed onboarding fixture states
pnpm db:check                    # DB types, migrations, and lint
```

---

## License

MIT. See `LICENSE`.
