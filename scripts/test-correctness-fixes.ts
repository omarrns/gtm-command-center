/**
 * Verification script for pipeline correctness fixes.
 *
 * Validates GTM/account pipeline correctness behaviors via source-level
 * structural checks:
 *   1. worker/claim rejects malformed/empty JSON bodies
 *   2. workflow loadConfig distinguishes missing config from query failure
 *   3. applyManuallyAction returns failure when no row matches
 *   4. gtm-find-contacts jobs are claimable and deduped only while pending
 *   5. account contact enrichment uses any-email semantics
 *   6. score results expose scored opportunity IDs for dormant enqueue
 *
 * Usage:
 *   npx tsx scripts/test-correctness-fixes.ts
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

console.log("Pipeline correctness fixes — verification\n");

/* ── 1. worker/claim route: malformed and empty JSON ─────────────── */
console.log("1. worker/claim — malformed JSON handling");

const claimSource = readFileSync(
  join(ROOT, "src/app/api/worker/claim/route.ts"),
  "utf-8",
);

assert(
  !claimSource.includes(".catch(() => ({}))"),
  "worker/claim must not silently swallow JSON parse errors",
);

assert(
  claimSource.includes("status: 400"),
  "worker/claim must return 400 for malformed bodies",
);

assert(
  claimSource.includes("ALL_JOB_TYPES"),
  "worker/claim must still reference ALL_JOB_TYPES for valid-body default",
);

assert(
  claimSource.includes('"gtm-find-contacts"'),
  "worker/claim default job types must include gtm-find-contacts",
);

/* ── 2. workflow loadConfig: error classification ────────────────── */
console.log("2. workflow — config error classification");

const workflowSource = readFileSync(
  join(ROOT, "src/lib/pipeline/workflow.ts"),
  "utf-8",
);

// loadConfig must use .maybeSingle() so missing-row returns null, not an error
assert(
  workflowSource.includes(".maybeSingle()"),
  "loadConfig must use .maybeSingle() to distinguish missing config from query failure",
);

assert(
  workflowSource.includes("query failed"),
  "loadConfig must surface Supabase query failures with a distinct message",
);

assert(
  workflowSource.includes("No pipeline_config row found"),
  "loadConfig must surface missing-row case with a distinct message",
);

assert(
  workflowSource.includes("log.error"),
  "pipelineWorkflow catch must log the original error",
);

assert(
  workflowSource.includes("catch (err)"),
  "pipelineWorkflow catch must capture the error object (not bare catch)",
);

/* ── 3. applyManuallyAction: row-match verification ──────────────── */
console.log("3. applyManuallyAction — row-match verification");

const actionsSource = readFileSync(
  join(ROOT, "src/app/(app)/actions.ts"),
  "utf-8",
);

const applyStart = actionsSource.indexOf(
  "export async function applyManuallyAction",
);

assert(applyStart !== -1, "applyManuallyAction must exist in actions.ts");

const applyBlock = actionsSource.slice(applyStart, applyStart + 1200);

assert(
  applyBlock.includes('.select("id")') || applyBlock.includes(".select('id')"),
  "applyManuallyAction must select the updated row to verify a match",
);

assert(
  applyBlock.includes("!data?.length") ||
    applyBlock.includes("data?.length === 0") ||
    applyBlock.includes("!data"),
  "applyManuallyAction must check for zero matched rows",
);

assert(
  applyBlock.includes("ok: false"),
  "applyManuallyAction must return failure when no row matched",
);

/* ── 4. GTM contact job idempotency/claimability ─────────────────── */
console.log("4. gtm-find-contacts — job registration and pending-only dedup");

const workerSource = readFileSync(
  join(ROOT, "src/lib/jobs/worker.ts"),
  "utf-8",
);
const migrationSource = readFileSync(
  join(ROOT, "supabase/migrations/20260426224808_recipient_alternate_and_socials.sql"),
  "utf-8",
);

assert(
  workerSource.includes('"gtm-find-contacts"'),
  "worker HANDLERS map must register gtm-find-contacts",
);

assert(
  migrationSource.includes("payload->>'opportunityId'"),
  "jobs dedup index must key off payload->>'opportunityId'",
);

assert(
  migrationSource.includes("status = 'pending'") &&
    !migrationSource.includes("status IN ('pending', 'running')"),
  "jobs dedup index must be pending-only so stale running jobs do not block retries",
);

/* ── 5. GTM contact enrichment stage decision ────────────────────── */
console.log("5. enrichContactsForAccount — stage decision semantics");

const enrichContactsSource = readFileSync(
  join(ROOT, "src/lib/pipeline/steps/enrich-contacts-account.ts"),
  "utf-8",
);

assert(
  enrichContactsSource.includes("anyEmail") &&
    enrichContactsSource.includes('"enriched"'),
  "enrichContactsForAccount must advance to enriched when any contact has email",
);

assert(
  enrichContactsSource.includes("allTerminal") &&
    enrichContactsSource.includes('"needs_contact"'),
  "enrichContactsForAccount must advance to needs_contact only when contacts are terminal",
);

assert(
  enrichContactsSource.includes("retrying: true"),
  "enrichContactsForAccount must keep researched rows retryable when no terminal decision exists",
);

/* ── 6. ScoreResult IDs for dormant cron ─────────────────────────── */
console.log("6. ScoreResult — scoredOpportunityIds");

const scoreSource = readFileSync(
  join(ROOT, "src/lib/pipeline/steps/score.ts"),
  "utf-8",
);
const scoreAccountsSource = readFileSync(
  join(ROOT, "src/lib/pipeline/steps/score-accounts.ts"),
  "utf-8",
);
const dormantCronSource = readFileSync(
  join(ROOT, "src/app/api/cron/dormant-discover/route.ts"),
  "utf-8",
);

assert(
  scoreSource.includes("scoredOpportunityIds: string[]"),
  "ScoreResult must expose scoredOpportunityIds",
);

assert(
  scoreSource.includes("result.scoredOpportunityIds.push(opp.id)") &&
    scoreAccountsSource.includes("result.scoredOpportunityIds.push(opp.id)"),
  "both scoring lanes must populate scoredOpportunityIds",
);

assert(
  dormantCronSource.includes("score.scoredOpportunityIds") &&
    dormantCronSource.includes("enqueueGtmFindContactsJob"),
  "dormant cron must enqueue contact jobs from scoredOpportunityIds",
);

/* ── Results ─────────────────────────────────────────────────────── */

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nVerification FAILED — see errors above.");
  process.exit(1);
} else {
  console.log("All checks passed.");
}
