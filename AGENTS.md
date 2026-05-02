# Agent Instructions — GTM Command Center

## What This Is

A browser-based autonomous job-search agent. It discovers roles, scores them, researches contacts, enriches emails, drafts outreach, queues opportunities for approval, sends approved emails through Gmail, and tracks replies. Single-user tool, not a product for others.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS v4 (CSS-based config, no tailwind.config.ts) + shadcn/ui
- **Database**: Supabase (Postgres + Auth)
- **Deployment**: Vercel
- **AI**: Vercel AI SDK v6 + Vercel AI Gateway routing to Claude models
- **Font**: Geist (via next/font/google)
- **Icons**: Phosphor Icons for app-owned UI via `@phosphor-icons/react/ssr` (14-16px standard sizes; regular default, fill for selected/high-emphasis states)

## Reference Docs

Keep this file small. It is loaded up front by agents.

- Detailed architecture, state machines, routes, database notes, cron schedules, onboarding/template details, AI-call conventions, shared UI patterns, design notes, and scripts: `docs/agent-reference.md`
- Design language and product feel: `DESIGN.md`
- Phase-by-phase build history: `CHANGELOG.md`
- ICP rubric architecture: `docs/icp-rubric-architecture.md`
- Deferred product/architecture work: `docs/DEFERRED.md`

Read `docs/agent-reference.md` before changing pipeline, onboarding, scoring, send flow, auth, AI/model calls, GTM account behavior, shared UI, cron/webhook routes, or any route listed there.

## High-Risk Invariants

- `src/lib/pipeline/workflow.ts` is the live job_seeker orchestrator. Do not add a parallel synchronous pipeline runner.
- GTM recurring/realtime entry points are `/api/cron/dormant-discover` and `/api/webhooks/theirstack`, not `/api/cron/pipeline`.
- GTM account retention: `/accounts` must keep every pipeline-promoted account except `discovered`, `filtered`, and explicit user dismissals (`skipped`). Do not auto-remove accounts just because they move to `researched`, `needs_contact`, `enriched`, `queued`, `sent`, or `replied`.
- Send Flow is safety-critical: after Gmail returns IDs, never revert `sending` back to `queued`. Return a reconciliation error instead of risking duplicate sends.
- All cron endpoints are `GET`, require bearer `CRON_SECRET`, and fail closed if missing or mismatched.
- `pipeline_config` is client-readable but not client-writable. Mutations go through server actions or service-role code.
- AI calls use Vercel AI Gateway via `gateway(modelId)` from `ai`. Do not import `@ai-sdk/anthropic` or wrap models with `anthropic(...)`.
- Model slugs use Gateway provider/model format with dotted versions, e.g. `anthropic/claude-opus-4.6` and `anthropic/claude-sonnet-4.6`.
- `components/ai-elements/` is vendored from Vercel AI Elements. Do not hand-refactor; re-vendor from upstream.
- `command-palette.tsx` and `sidebar-nav.tsx` are intentionally custom. Do not replace them with shadcn `command` or `sidebar` without an explicit ask.
- Combined/integration branches are for visual QA only unless the user explicitly chooses to merge them. Prefer clean topic branches for review. If an integration branch includes Supabase migrations, apply or verify those migrations before browser QA; a page can fail from remote schema cache drift even when the TypeScript branch is correct.

## Scripts

```bash
pnpm dev                  # Start dev server
pnpm build                # Production build
pnpm seed                 # Run all imports
pnpm onboard:reset        # Delete all onboarding data
pnpm onboard:fixture      # Seed onboarding fixture states
pnpm test                 # Umbrella test suite
pnpm test:correctness     # Pipeline correctness guardrails
pnpm test:extraction      # Opus extraction fixture
pnpm test:onboarding-confirm
pnpm test:sender-identity
```

Full script notes live in `docs/agent-reference.md` and `package.json`.

## Plans

When creating a plan, also write a human-readable copy to `.claude/plans/<feature-slug>.md` where the slug describes the build, e.g. `phase-2-icp-template.md` or `fix-scoring-weights.md`. Use the same content as the plan. The CLI may generate its own random-named file alongside it; ignore it.

## Behavioral Principles

These govern how you approach work. Follow them before touching code.

### 1. Think Before Coding

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; do not pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what is confusing. Ask.
- Read existing files first. Match their patterns.
- Check if an existing function or dependency already solves the problem.
- For changes touching more than 3 files, explain the plan first.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that was not requested.
- When a local, direct fix and a generalized architectural fix both work, choose the local fix unless the broader abstraction is required by current call sites.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Extract after 3 repetitions, not 2. Premature abstraction is worse than duplication.
- Three similar lines are better than one clever abstraction used once.
- Never abstract across domain boundaries. Scrape helpers stay in scrape, score helpers stay in score.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it; do not delete it.
- Remove imports/variables/functions that your changes made unused.
- Do not remove pre-existing dead code unless asked.
- Do not remove or replace working code unless explicitly asked.

The test: every changed line should trace directly to the request.

### 4. Goal-Driven Execution

Transform tasks into verifiable goals. Loop until verified.

- "Add validation" means write tests for invalid inputs, then make them pass.
- "Fix the bug" means write a test that reproduces it, then make it pass.
- "Refactor X" means ensure tests pass before and after.

For multi-step tasks, state a brief plan:

```text
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Success criteria let you work independently. Weak criteria like "make it work" require clarification.

## Technical Rules

These are constraints. Violating any rule is a bug.

### File Size

- Hard limit: 400 lines per file for owned source. No exceptions for data files, schemas, or prompts.
- Vendored upstream code is exempt: `src/components/ai-elements/**` is re-vendored from Vercel AI Elements and not hand-edited.
- If a file approaches 400 lines, split it before adding code. Extract the largest coherent unit into a new file named after what it does, not where it came from.
- `pnpm agent:check` enforces this rule against an `scripts/agent-check.baseline.json` of currently-grandfathered files. Do not edit the baseline to silence a violation; shrink the file instead.

### Functions

- One clear purpose per function. If you need the word "and" to describe it, split it.
- Max 2 levels of callback nesting. Flatten with early returns or extract helpers.
- Functions are verbs: `fetchJobSignals`, `scoreAccount`, `validateFactLedger`.
- Max 50 lines per function body. If it is longer, it has more than one responsibility.

### Naming

- Variables are nouns. Functions are verbs. Booleans start with `is`, `has`, or `should`.
- No abbreviations except `id`, `url`, `db`.
- If a variable needs a comment to explain what it is, rename it instead.

### TypeScript

- Strict mode in `tsconfig.json`. No exceptions.
- Never use `any`. Use `unknown` and narrow explicitly.
- Infer types from Zod schemas via `z.infer<typeof Schema>`. Never hand-write a parallel type that duplicates a schema.
- All data crossing a trust boundary must be validated with Zod before use. A validation failure is an error, not a fallback.

### Comments and Documentation

- Comments explain why, never what.
- Delete commented-out code. It lives in git.
- Every non-obvious business rule gets a one-line comment with context.
- No JSDoc on internal functions unless the signature is genuinely ambiguous.

### Error Handling

- Never swallow errors with empty catch blocks.
- Throw early, catch at the boundary.
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
- After switching to a branch with new migrations, run a dry migration check before visual QA. If the app points at hosted Supabase via `.env.local`, local Docker/Supabase status is not enough; use `supabase db push --dry-run` or an equivalent schema query against the configured project.
- No raw SQL in pipeline files. Named query functions live in dedicated query files.

### Prompts

- Prompts are business logic. Version and review them like code.
- All prompt builders live in `src/lib/skills/prompts/`.
- Prompt builders accept `SenderIdentity`; call sites derive it via `extractSenderIdentity(ctx, displayName)`.
- Never inline a multi-line prompt string in a route handler or pipeline function.
- When a prompt changes, the commit message explains what behavior the change targets.

### Testing

- Score logic: unit test with fixture data. No Claude, no DB.
- Zod schemas: test with saved Claude output fixtures. Run after any prompt change.
- Never mock Claude in tests meant to catch prompt regressions.
- Fixtures live in `src/lib/pipeline/__tests__/fixtures/`.

### Idempotency

Every pipeline stage must be safe to run twice on the same input.
