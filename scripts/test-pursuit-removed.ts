/**
 * Verification script for the pursuit-planner removal refactor.
 *
 * Validates that the workflow collapsed back to:
 *   discover → score → research → enrich → draft → recover
 *
 * with no pursuit-planner intermediate layer. Every opportunity that clears
 * score_threshold gets the same single Exa Websets people-search + enrichment
 * treatment — no LLM-driven mode tiering, no archetype branching, no skip path
 * from the pipeline.
 *
 * Source-level structural checks. No DB, no Claude.
 *
 * Usage:
 *   npx tsx scripts/test-pursuit-removed.ts
 */

import { existsSync, readFileSync } from "node:fs";
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

console.log("Pursuit-planner removal — verification\n");

/* ── 1. Pursuit module is deleted ──────────────────────────────── */
console.log("1. pursuit module deletion");

assert(
  !existsSync(join(ROOT, "src/lib/pipeline/pursuit")),
  "src/lib/pipeline/pursuit/ directory must not exist",
);
assert(
  !existsSync(join(ROOT, "src/lib/pipeline/pursuit/planner.ts")),
  "src/lib/pipeline/pursuit/planner.ts must be deleted",
);
assert(
  !existsSync(join(ROOT, "src/lib/pipeline/pursuit/execute-plan.ts")),
  "src/lib/pipeline/pursuit/execute-plan.ts must be deleted",
);

/* ── 2. workflow.ts has no pursuit residue ─────────────────────── */
console.log("2. workflow.ts — no pursuit residue");

const workflowSource = readFileSync(
  join(ROOT, "src/lib/pipeline/workflow.ts"),
  "utf-8",
);

for (const symbol of [
  "@/lib/pipeline/pursuit",
  "planPursuit",
  "executePlans",
  "PursuitPlan",
  "stepPlanPursuits",
  "stepExecutePlans",
  "pursuitPlans",
  "MAX_PURSUITS_PER_RUN",
]) {
  assert(
    !workflowSource.includes(symbol),
    `workflow.ts must not contain "${symbol}"`,
  );
}

/* ── 3. workflow body wires the uniform pipeline ───────────────── */
console.log("3. workflow body — canonical step order");

const stepOrder = [
  "stepDiscover",
  "stepScore",
  "stepResearch",
  "stepEnrich",
  "stepDraft",
];

for (const step of [...stepOrder, "stepRecoverStranded"]) {
  assert(workflowSource.includes(step), `workflow.ts must still call ${step}`);
}

// Each step is defined once and invoked once. lastIndexOf finds the
// invocation (which always follows the definition).
const positions = stepOrder.map((s) =>
  workflowSource.lastIndexOf(`= await ${s}(`),
);
const allFound = positions.every((p) => p > 0);
const monotonic = positions.every((p, i) => i === 0 || p > positions[i - 1]);
assert(
  allFound && monotonic,
  `pipeline steps must invoke in order: ${stepOrder.join(" → ")} (positions: ${positions.join(", ")})`,
);

/* ── 4. Score step keeps the threshold gate ────────────────────── */
console.log("4. score step — threshold is the only gate");

const scoreSource = readFileSync(
  join(ROOT, "src/lib/pipeline/steps/score.ts"),
  "utf-8",
);

assert(
  scoreSource.includes("config.score_threshold"),
  "score step must compare normalizedScore against config.score_threshold",
);
assert(
  scoreSource.includes('"scored"') && scoreSource.includes('"filtered"'),
  "score step must transition to 'scored' or 'filtered' based on threshold",
);

/* ── 5. Research step is uniform (no archetype targeting) ──────── */
console.log("5. research step — uniform call to researchPeople");

const researchSource = readFileSync(
  join(ROOT, "src/lib/pipeline/steps/research.ts"),
  "utf-8",
);

assert(
  researchSource.includes('"scored"'),
  "research step must claim opportunities at stage 'scored'",
);

// targetContact was the planner's archetype-forcing param. The uniform
// path calls researchPeople(company, role, userId, svc) with no options.
assert(
  !researchSource.includes("targetContact"),
  "research step must call researchPeople without targetContact (uniform default search)",
);

/* ── 6. test-correctness-fixes.ts cleanup is intact ────────────── */
console.log("6. test-correctness-fixes.ts — pursuit section removed");

const testCorrectness = readFileSync(
  join(ROOT, "scripts/test-correctness-fixes.ts"),
  "utf-8",
);

assert(
  !testCorrectness.includes("execute-plan"),
  "test-correctness-fixes must not reference execute-plan.ts",
);
assert(
  !testCorrectness.includes("executePursuit"),
  "test-correctness-fixes must not reference executePursuit",
);

/* ── Results ────────────────────────────────────────────────────── */

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nVerification FAILED — see errors above.");
  process.exit(1);
} else {
  console.log("All checks passed.");
}
