/**
 * Verification script for pipeline correctness fixes.
 *
 * Validates three behaviors via source-level structural checks:
 *   1. worker/claim rejects malformed/empty JSON bodies
 *   2. workflow loadConfig distinguishes missing config from query failure
 *   3. applyManuallyAction returns failure when no row matches
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
  workflowSource.includes("console.error"),
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

/* ── Results ─────────────────────────────────────────────────────── */

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nVerification FAILED — see errors above.");
  process.exit(1);
} else {
  console.log("All checks passed.");
}
