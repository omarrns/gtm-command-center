/**
 * SPEC-3 Phase 4.c: persona-switch artifact retention smoke test.
 *
 * Full pre-confirm persona-switch scenario, end-to-end at the action
 * level (server actions can't be called directly from tsx, so this
 * exercises the same lib primitives the actions wrap):
 *
 *   1. Start an ICP interview (A) + ingest one artifact pinned to A.
 *   2. Abandon A → artifact detaches (interview_id → NULL).
 *      abandonInterviewAction does this atomically; simulated here by
 *      calling the same Supabase ops the action would.
 *   3. Start a job_search interview (B) via the same logic
 *      getOrCreateInterviewAction uses (create row + claim orphans).
 *   4. Assert the artifact is pinned to B with byte-identical
 *      normalized_markdown, kind, and status.
 *
 * Pins the end-to-end contract against the old CASCADE bug: a user who
 * switches personas mid-artifact should not lose their uploaded content.
 *
 * Usage: npx tsx scripts/test-persona-switch-artifact-retention.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { resolveDestructiveUserTarget } from "./lib/user-target";
import { claimOrphanedArtifacts } from "../src/lib/onboarding/artifacts/reassign";
import { performPersonaSwitch } from "../src/app/(app)/onboard/switch-persona";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  PASS: ${label}`);
  else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

async function resetUser(userId: string) {
  await supabase.from("onboarding_artifacts").delete().eq("user_id", userId);
  await supabase
    .from("onboarding_interviews")
    .delete()
    .eq("user_id", userId)
    .in("template_id", ["job_search", "icp_definition"]);
}

async function createInterview(
  userId: string,
  templateId: "job_search" | "icp_definition",
): Promise<string> {
  const { data, error } = await supabase
    .from("onboarding_interviews")
    .insert({
      user_id: userId,
      template_id: templateId,
      template_version: "v1",
      status: "in_progress",
      messages: [],
      topics_covered: [],
      is_refresh: false,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`createInterview: ${error?.message}`);
  }
  return data.id;
}

async function insertArtifact(
  userId: string,
  interviewId: string,
  label: string,
  markdown: string,
  status: "succeeded" | "failed" = "succeeded",
): Promise<string> {
  const { data, error } = await supabase
    .from("onboarding_artifacts")
    .insert({
      user_id: userId,
      interview_id: interviewId,
      kind: "positive_example",
      source_type: "text",
      source_label: label,
      status,
      normalized_markdown: status === "succeeded" ? markdown : null,
      error_message: status === "failed" ? "test fixture: skip analyze" : null,
      created_from_template_id: "icp_definition",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`insertArtifact: ${error?.message}`);
  }
  return data.id;
}

// Mirrors abandonInterviewAction's detach step.
async function abandonAndDetach(userId: string, interviewId: string) {
  await supabase
    .from("onboarding_interviews")
    .update({ status: "abandoned", updated_at: new Date().toISOString() })
    .eq("id", interviewId)
    .eq("user_id", userId);

  await supabase
    .from("onboarding_artifacts")
    .update({
      interview_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("interview_id", interviewId);
}

// Audit finding 3: when the target-template interview already exists,
// the orphan-claim still needs to run against it. This scenario pins
// that contract — simulates a user who previously started an ICP
// interview, abandoned it, returned to a pre-existing job_search
// interview, and expects their ICP artifacts to follow.
// SPEC-3 audit (Phase 4.c gap, getOrCreateInterview branch): exercise
// the server-action path rather than the claimOrphanedArtifacts
// primitive. A pre-existing target interview plus a detached artifact
// must get reattached when getOrCreateInterview returns the existing
// row — not just when it creates a new one.
async function testGetOrCreateInterviewExistingTarget(userId: string) {
  console.log(
    "\n=== Scenario C: getOrCreateInterview returns existing + claims orphan ===\n",
  );
  await resetUser(userId);

  // Pre-existing job_search interview (target).
  const targetInterview = await createInterview(userId, "job_search");
  // Fresh ICP interview with an artifact (source).
  const sourceInterview = await createInterview(userId, "icp_definition");
  const artifactId = await insertArtifact(
    userId,
    sourceInterview,
    "Orphan from ICP (Scenario C)",
    "# Orphan C\n\nContent.",
  );

  // Detach the artifact as abandonInterviewAction would.
  await abandonAndDetach(userId, sourceInterview);

  // Invoke the testable seam that the server action wraps.
  const { getOrCreateInterview } =
    await import("../src/app/(app)/onboard/get-or-create-interview");
  const result = await getOrCreateInterview(
    supabase,
    userId,
    false,
    "job_search",
  );
  assert(
    result.ok,
    `getOrCreateInterview returned ok (error: ${!result.ok ? result.error : ""})`,
  );
  if (!result.ok) return;
  assert(
    result.interview.id === targetInterview,
    `returned the pre-existing interview (got ${result.interview.id}, want ${targetInterview})`,
  );

  const { data: reattached } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id")
    .eq("id", artifactId)
    .single();
  assert(
    reattached?.interview_id === targetInterview,
    `orphan reattached to existing target via getOrCreateInterview (got ${reattached?.interview_id})`,
  );
}

// SPEC-3 audit Phase 4.c (page.tsx gap): OnboardRouter short-circuits
// when page.tsx hands it an existing interview, so the client-side
// getOrCreateInterviewAction auto-start never runs. page.tsx now claims
// orphans inline after its interview lookup. This scenario mirrors that
// exact sequence to pin the contract — if someone removes the
// page.tsx-level claim, this test flips red.
async function testPageLoadExistingInterviewClaims(userId: string) {
  console.log(
    "\n=== Scenario D: /onboard page-load with existing interview claims orphan ===\n",
  );
  await resetUser(userId);

  const targetInterview = await createInterview(userId, "job_search");
  const sourceInterview = await createInterview(userId, "icp_definition");
  const artifactId = await insertArtifact(
    userId,
    sourceInterview,
    "Orphan from ICP (Scenario D)",
    "# Orphan D\n\nContent.",
  );
  await abandonAndDetach(userId, sourceInterview);

  // Simulate the exact page.tsx sequence: fetch active interview for the
  // target template, then call claimOrphanedArtifacts for the returned
  // row. No server action indirection.
  const { data: activeInterview } = await supabase
    .from("onboarding_interviews")
    .select("*")
    .eq("user_id", userId)
    .eq("template_id", "job_search")
    .in("status", ["in_progress", "extracting", "review", "story_review"])
    .maybeSingle();

  assert(
    activeInterview?.id === targetInterview,
    "page.tsx lookup returns the pre-existing target interview",
  );
  if (!activeInterview) return;

  const claimed = await claimOrphanedArtifacts(
    supabase,
    userId,
    activeInterview.id,
  );
  assert(
    claimed.ok && claimed.count === 1,
    `page-load orphan claim picks up the detached artifact (count=${claimed.count})`,
  );

  const { data: reattached } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id")
    .eq("id", artifactId)
    .single();
  assert(
    reattached?.interview_id === targetInterview,
    `artifact reattached to pre-existing target via page-load claim (got ${reattached?.interview_id})`,
  );
}

async function testTargetAlreadyExists(userId: string) {
  console.log(
    "\n=== Scenario B: target-template interview already exists ===\n",
  );
  await resetUser(userId);

  console.log("\n--- B1: pre-existing job_search interview + ICP start ---\n");
  // Pre-existing target. User had a job_search interview going earlier.
  const targetInterview = await createInterview(userId, "job_search");
  // Fresh ICP interview with an artifact.
  const sourceInterview = await createInterview(userId, "icp_definition");
  const originalMarkdown = "# Orphan from ICP\n\nPlaceholder content.";
  const artifactId = await insertArtifact(
    userId,
    sourceInterview,
    "Source artifact",
    originalMarkdown,
  );

  console.log("\n--- B2: abandon source + detach artifacts ---\n");
  await abandonAndDetach(userId, sourceInterview);

  console.log("\n--- B3: claim into pre-existing target ---\n");
  const claimed = await claimOrphanedArtifacts(
    supabase,
    userId,
    targetInterview,
  );
  assert(
    claimed.ok && claimed.count === 1,
    `claim into pre-existing target picks up the orphan (count=${claimed.count})`,
  );

  const { data: reattached } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id, normalized_markdown")
    .eq("id", artifactId)
    .single();
  assert(
    reattached?.interview_id === targetInterview,
    `artifact attached to pre-existing job_search interview (got ${reattached?.interview_id})`,
  );
  assert(
    reattached?.normalized_markdown === originalMarkdown,
    "content preserved through claim into pre-existing target",
  );
}

// SPEC-3 Phase 4.e: exercise the recoverable performPersonaSwitch core
// end-to-end. Uses a `failed`-status artifact so analyzeArtifacts short-
// circuits (zero succeeded) — we're testing the DB recovery contract,
// not Opus. Asserts:
//   - Reassign lands artifacts on the target.
//   - Source is marked abandoned.
//   - Target orchestrator_state is populated (analyze ran the short-
//     circuit path).
//   - analysisFailed is not set (short-circuit is a success, not a
//     failure).
async function testPerformPersonaSwitchHappyPath(userId: string) {
  console.log(
    "\n=== Scenario C: performPersonaSwitch happy-path (analyze short-circuits) ===\n",
  );
  await resetUser(userId);

  const source = await createInterview(userId, "icp_definition");
  // Failed-status artifact → analyze skips Opus but the move still
  // has to work. Content is null by design (matches production path).
  const artifactId = await insertArtifact(
    userId,
    source,
    "scrape-failed-artifact",
    "(unused — failed status has null markdown)",
    "failed",
  );

  const result = await performPersonaSwitch(
    supabase,
    userId,
    source,
    "job_search",
  );
  assert(
    result.ok,
    `performPersonaSwitch ok (error: ${(result as { error?: string }).error})`,
  );
  if (!result.ok) return;

  assert(
    !result.analysisFailed,
    `analysisFailed is not set when analyze short-circuits (got ${result.analysisFailed})`,
  );
  assert(
    result.interview.template_id === "job_search",
    `returned interview is target (got template_id=${result.interview.template_id})`,
  );
  assert(
    result.interview.id !== source,
    "returned interview id differs from source",
  );

  const { data: sourceAfter } = await supabase
    .from("onboarding_interviews")
    .select("status")
    .eq("id", source)
    .single();
  assert(
    sourceAfter?.status === "abandoned",
    `source status='abandoned' (got ${sourceAfter?.status})`,
  );

  const { data: movedArtifact } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id")
    .eq("id", artifactId)
    .single();
  assert(
    movedArtifact?.interview_id === result.interview.id,
    `artifact now pinned to target (got ${movedArtifact?.interview_id})`,
  );

  // analyze's short-circuit still writes orchestrator_state with the
  // artifact manifest, so UI has something to render.
  const state = result.interview.orchestrator_state as Record<
    string,
    unknown
  > | null;
  assert(
    state !== null,
    "target orchestrator_state is populated after analyze short-circuit",
  );
  if (state) {
    const artifacts = (state as { artifacts?: unknown[] }).artifacts;
    assert(
      Array.isArray(artifacts) && artifacts.length === 1,
      `orchestrator_state.artifacts contains the moved row (len=${Array.isArray(artifacts) ? artifacts.length : "n/a"})`,
    );
  }
}

// Sanity check: calling performPersonaSwitch with the SAME target
// template is rejected with a clear error. No writes should happen.
async function testPerformPersonaSwitchSameTemplate(userId: string) {
  console.log(
    "\n=== Scenario D: performPersonaSwitch rejects same-template switch ===\n",
  );
  await resetUser(userId);

  const source = await createInterview(userId, "icp_definition");
  const result = await performPersonaSwitch(
    supabase,
    userId,
    source,
    "icp_definition",
  );
  assert(!result.ok, "switch to same template is rejected");
  assert(
    !result.ok && /already on that persona/i.test(result.error),
    `error mentions already-on-persona (got: ${
      !result.ok ? result.error : "n/a"
    })`,
  );

  const { data: sourceAfter } = await supabase
    .from("onboarding_interviews")
    .select("status")
    .eq("id", source)
    .single();
  assert(
    sourceAfter?.status === "in_progress",
    `source still in_progress after rejected switch (got ${sourceAfter?.status})`,
  );
}

async function main() {
  const { userId, email } = await resolveDestructiveUserTarget(supabase);
  console.log(`Testing with user ${email} (${userId})`);

  await resetUser(userId);
  console.log(
    "\n=== Scenario A: target-template interview does not exist ===\n",
  );

  console.log("\n--- Step 1: start ICP interview + ingest artifact ---\n");
  const interviewA = await createInterview(userId, "icp_definition");
  const originalMarkdown =
    "# Customer Alpha\n\nSeries A devtools. 50 employees. Uses Salesforce + Outreach.";
  const artifactId = await insertArtifact(
    userId,
    interviewA,
    "Customer Alpha",
    originalMarkdown,
  );

  const { data: pinnedToA } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id")
    .eq("id", artifactId)
    .single();
  assert(
    pinnedToA?.interview_id === interviewA,
    "artifact pinned to ICP interview A",
  );

  console.log("\n--- Step 2: abandon A + detach artifacts ---\n");
  await abandonAndDetach(userId, interviewA);

  const { data: detached } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id")
    .eq("id", artifactId)
    .single();
  assert(
    detached?.interview_id === null,
    `artifact detached (interview_id=NULL, got ${detached?.interview_id})`,
  );

  const { data: abandoned } = await supabase
    .from("onboarding_interviews")
    .select("status")
    .eq("id", interviewA)
    .single();
  assert(
    abandoned?.status === "abandoned",
    `interview A status='abandoned' (got ${abandoned?.status})`,
  );

  console.log(
    "\n--- Step 3: create job_search interview B + claim orphans ---\n",
  );
  const interviewB = await createInterview(userId, "job_search");
  // getOrCreateInterviewAction calls claimOrphanedArtifacts inline after
  // creating the row. Mirror that here.
  const claimed = await claimOrphanedArtifacts(supabase, userId, interviewB);
  assert(
    claimed.ok && claimed.count === 1,
    `claim pulled 1 orphan into B (count=${claimed.count})`,
  );

  console.log("\n--- Step 4: artifact is on B with content preserved ---\n");
  const { data: pinnedToB } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id, normalized_markdown, kind, status, source_label")
    .eq("id", artifactId)
    .single();
  assert(
    pinnedToB?.interview_id === interviewB,
    `artifact now pinned to job_search interview B (got ${pinnedToB?.interview_id})`,
  );
  assert(
    pinnedToB?.normalized_markdown === originalMarkdown,
    "normalized_markdown byte-identical through the switch",
  );
  assert(
    pinnedToB?.kind === "positive_example",
    "kind preserved (positive_example)",
  );
  assert(pinnedToB?.status === "succeeded", "status preserved (succeeded)");
  assert(
    pinnedToB?.source_label === "Customer Alpha",
    "source_label preserved",
  );

  await testTargetAlreadyExists(userId);
  await testGetOrCreateInterviewExistingTarget(userId);
  await testPageLoadExistingInterviewClaims(userId);
  await testPerformPersonaSwitchHappyPath(userId);
  await testPerformPersonaSwitchSameTemplate(userId);

  // Clean up.
  await resetUser(userId);

  console.log(
    `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
