/**
 * Structural verification for async ICP artifact analysis.
 *
 * This intentionally avoids live Opus calls. For live coverage, upload an ICP
 * artifact batch locally and inspect jobs + ai_calls for
 * onboarding-artifact-analysis / orchestrator.analyze.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

let failures = 0;

function read(path: string) {
  return readFileSync(join(ROOT, path), "utf8");
}

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
  } else {
    failures++;
    console.error(`  FAIL: ${label}`);
  }
}

console.log("Async onboarding artifact analysis — structural verification\n");

const route = read("src/app/api/onboard/artifacts/route.ts");
const worker = read("src/lib/jobs/worker.ts");
const claimRoute = read("src/app/api/worker/claim/route.ts");
const handler = read("src/lib/jobs/handlers/onboarding-artifact-analysis.ts");
const orchestrator = read("src/lib/onboarding/orchestrator/run.ts");
const artifactInput = read(
  "src/app/(app)/onboard/_components/artifact-input.tsx",
);
const jobHelper = read("src/lib/jobs/onboarding-artifact-analysis.ts");

assert(
  worker.includes('"onboarding-artifact-analysis"') &&
    worker.includes("runOnboardingArtifactAnalysisJob"),
  "worker registers onboarding-artifact-analysis handler",
);

assert(
  claimRoute.includes('"onboarding-artifact-analysis"'),
  "worker claim default types include onboarding-artifact-analysis",
);

assert(
  route.includes("enqueueOnboardingArtifactAnalysisJob") &&
    !route.includes("return analyzeArtifacts("),
  "artifact route queues analysis instead of running analyzeArtifacts inline",
);

assert(
  route.includes('status: succeeded.length > 0 ? "analyzing" : "interviewing"'),
  "artifact route writes lightweight analyzing/interviewing state",
);

assert(
  jobHelper.includes("pokeWorker") &&
    jobHelper.includes("ONBOARDING_ARTIFACT_ANALYSIS_JOB"),
  "job helper inserts and pokes worker",
);

assert(
  handler.includes("analyzeArtifacts") &&
    handler.includes("markAnalysisFailed") &&
    handler.includes("StaleOrchestratorAnalysisError"),
  "job handler reuses analyzeArtifacts and handles failure/stale cases",
);

assert(
  orchestrator.includes("analysisRunId?: string") &&
    orchestrator.includes(
      "orchestrator_state->metrics->>currentAnalysisRunId",
    ),
  "orchestrator persists with analysisRunId CAS guard",
);

assert(
  artifactInput.includes("getOrchestratorStateAction") &&
    artifactInput.includes('analysisState?.status !== "analyzing"') &&
    artifactInput.includes("canEnterChat"),
  "artifact input polls interview state and gates chat entry",
);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log("\nAll async artifact-analysis structural checks passed.");
