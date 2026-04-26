# /accounts audit follow-ups

Items from the 2026-04-25 /accounts code review that were held for a
separate session. Both are P1. Picked up by reading this doc front to
back; both blocks are self-contained.

## Context — what shipped, what didn't

The /accounts dismiss work landed (commit on `main` 2026-04-25): new
dismiss button gated by `canSkip`, `revalidatePath("/accounts")` on
skip + flag, page-copy fix, error banner instead of silent empty state,
`company_domain` normalisation at `createOpportunity`, webhook test
header rename. Tests green: typecheck, build, pipeline-regression,
theirstack-webhook.

What's left is the deeper structural stuff that needed regression
coverage I didn't want to bundle into the dismiss PR.

---

## 1. `pipelineWorkflow` runs on GTM users (P1)

### What's broken

`/api/cron/pipeline` (`src/app/api/cron/pipeline/route.ts:42-44`)
selects every row from `pipeline_config` and dispatches
`pipelineWorkflow` for each. Both `job_seeker` and `gtm` users have
`pipeline_config` rows, so GTM users get the job-seeker pipeline run
on them every 6 hours.

The workflow does:

1. **discover** — JSearch using `config.search_queries`. GTM users
   inherit the default `["GTM Engineer", "Growth Engineer"]`, so
   JSearch returns matches and inserts `source='jsearch'` rows.
2. **score** — `runScore` in `src/lib/pipeline/steps/score.ts:133`
   calls `getOpportunitiesByStage(svc, userId, "discovered", 10)`
   with **no source filter**. It picks up:
   - the freshly-created `jsearch` rows
   - any `theirstack` / `exa-dormant` rows stuck in `discovered`
     (e.g. webhook scoring threw, last_error set, stage unchanged)
   - and runs the **job-seeker** scorer (`scoring.ts → analysisSchema`)
     against them. For account rows with null `role_title` and a
     company-shaped `job_description`, the scorer doesn't crash — it
     just produces a bogus job-seeker analysis and advances the row
     to `scored`.
3. From `scored`, research / enrich / draft / send all proceed. A
   GTM user could end up sending a job-seeker outreach email about
   one of their target accounts.

`score-accounts.ts:131-139` already has the inverse defensive comment
about scoping the GTM scorer's query to `theirstack`/`exa-dormant`.
The symmetric guard is missing on the job-seeker side.

### Why I held it

Behaviour change with no test coverage. `test:pipeline-regression`
calls `runGtmPipeline` directly (which is correct), but doesn't
exercise the cron-route → `pipelineWorkflow` path for a GTM user.
Per the project memory rule on regression-before-refactor, a Phase 0
test should land first.

### Fix

Smallest contained change: short-circuit in `loadConfig` based on
`profiles.user_type`.

`src/lib/pipeline/workflow.ts:51-75` — `loadConfig` currently returns
`PipelineConfigRow`. Change to return `{ config, userType }`:

```ts
async function loadConfig(userId: string, runId: string) {
  "use step";
  const log = createLogger({ ... });
  const svc = createSupabaseServiceClient();
  const [configRes, profileRes] = await Promise.all([
    svc.from("pipeline_config").select("*").eq("user_id", userId).maybeSingle(),
    svc.from("profiles").select("user_type").eq("user_id", userId).maybeSingle(),
  ]);
  if (configRes.error) throw new Error(...);
  if (!configRes.data) throw new Error("No pipeline_config row found for user");
  return {
    config: configRes.data as PipelineConfigRow,
    userType: profileRes.data?.user_type ?? null,
  };
}
```

In `pipelineWorkflow` (`workflow.ts:218-256`), after the `loadConfig`
try/catch, check `userType`:

```ts
const { config, userType } = await loadConfig(userId, runId);
if (userType === "gtm") {
  log.info("skipping job-seeker pipeline — user is gtm persona");
  return emptyResult(userId, runId, startedAt, null);
}
```

Extract the empty-result builder so the early-exit and the existing
loadConfig-failure path share it.

Don't bother with the `runScore` source-scoping fix once the
short-circuit lands — the upstream guard makes it dead code. If the
short-circuit ever gets reverted, fall back to scoping
`runScore` to `{ sources: ["jsearch", "manual"] }` as a defence in depth.

### Phase 0 regression test

New file: `scripts/test-pipeline-workflow-persona.ts`. Idea — exercise
both personas through the workflow, assert the right things happen.

Setup (mirror existing pipeline-regression fixtures):

- Stub `fetch` for JSearch and Exa to return canned fixtures.
- Stub Anthropic `generateObject` to return a deterministic high-score
  analysis.
- Insert two test users into `profiles` + `pipeline_config`:
  - `test-user-job-seeker` with `user_type='job_seeker'`
  - `test-user-gtm` with `user_type='gtm'`
- Both get the default `search_queries = ["GTM Engineer", ...]`.

Test 1 (current behaviour, runs green on main today):

- Call `pipelineWorkflow("test-user-job-seeker", runId)`.
- Assert `discover.found > 0`, `score.scored > 0`, opportunities table
  has rows for that user.

Test 2 (locks in the bug we want to fix; should FAIL once the fix
lands, then we flip the assertion):

- Call `pipelineWorkflow("test-user-gtm", runId)`.
- On main today: `discover.found > 0`, `score.scored > 0`, GTM user
  has `jsearch`-source rows. Document this as the current broken
  behaviour.
- After the fix: `discover.found === 0`, `score.scored === 0`, no
  `jsearch` rows for GTM user.

Order: write the test, run it on main, verify it documents current
behaviour, _then_ flip the assertion + ship the fix in the same
commit.

Wire into the `npm test` umbrella in `package.json:20`.

### Risk

Low once the test lands. The fix touches one file. Job-seeker users are
unaffected. The only behaviour change is "GTM user's pipelineWorkflow
becomes a no-op", which is exactly the contract CLAUDE.md already
documents (`pipelineWorkflow` does not branch on user_type → should be:
runs only for job_seeker).

---

## 2. `SKIPPABLE_STAGES` vs `/accounts` page query (P1, deferred time bomb)

### What's broken

`src/app/(app)/accounts/page.tsx:48` filters out only
`(discovered, filtered, skipped)` — so `sending`, `sent`, `replied` are
all visible on /accounts.

`src/lib/pipeline/stages.ts:5` — `SKIPPABLE_STAGES` excludes `sending`,
`sent`, `replied`.

Once a GTM account reaches a terminal stage, the dismiss button
disappears (correctly — gated by `canSkip` from the dismiss work) but
the row stays visible forever with no escape hatch. Per
`feedback_accounts_never_auto_remove.md` the contract is "rows persist
until **explicit user dismissal**" — so a row you can't dismiss
violates the spirit of the rule.

### Why I held it

Inert today. The GTM lane stops at `scored` — there's no draft, no
send, no reply tracking. So no row currently visible on /accounts is
ever in `sending`/`sent`/`replied`. The button is on every card; the
contract holds in practice.

This becomes real the moment the GTM lane gains a draft/send step.

### Trigger to revisit

Any of:

- A GTM-side draft/send step lands (`src/lib/pipeline/steps/` gains
  a GTM-specific draft module, or `gtm-runner.ts` adds a draft phase).
- `/accounts` starts rendering rows where `canSkip === false` (visible
  in the production logs as cards rendered without a Dismiss button —
  add a one-line `console.warn` if you want a tripwire).
- The `feedback_accounts_never_auto_remove.md` rule comes up in
  another review and someone wants the contract enforced strictly.

### Two fixes, one decision

**Option A — widen `SKIPPABLE_STAGES`** to include `sent`, `replied`,
maybe `sending`. Pros: literal compliance with the
"always-dismissable" rule. Cons: skipping a row that's actually been
sent through the system is semantically weird — the stage transition
machinery in `advanceStage` would let a `sent` row be moved to
`skipped` and then disappear from /accounts. History would still show
it (filter on stage), so no data lost.

**Option B — narrow the page query** to skippable stages only. Drop
`sent`, `replied`, `sending` from the visible set. Pros: the page
becomes "things that need attention", which is closer to its intent.
Cons: violates the never-auto-remove rule — a stage transition (queued
→ sending → sent) does cause the row to leave /accounts.

I'd lean Option A. The contract is clear; widening the skip set is
safer than narrowing the visibility set; and the audit trail in
`/history` covers the "what happened to this account" question.

Either way, the change is small (~5 lines) once the trigger fires.
File: `src/lib/pipeline/stages.ts:5` for Option A; the page query at
`accounts/page.tsx:48` for Option B.

### Don't do this in advance

Picking either option now is choosing UX based on hypothetical state.
Wait for the trigger — the GTM draft/send work will probably surface
constraints we don't have today (e.g. sent state shows reply status,
which is more useful on /accounts than /history).

---

## How to pick this up

When you come back to this:

1. Read this file front to back.
2. Tackle item 1 first — Phase 0 test, then fix in the same commit.
3. Item 2 stays deferred unless its trigger has fired. If it has:
   pick A or B based on what the new GTM draft/send work looks
   like.
