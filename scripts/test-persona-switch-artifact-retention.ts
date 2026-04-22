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
import { claimOrphanedArtifacts } from "../src/lib/onboarding/artifacts/reassign";

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

async function resolveUserId(email: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .single();
  return data?.user_id ?? null;
}

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
): Promise<string> {
  const { data, error } = await supabase
    .from("onboarding_artifacts")
    .insert({
      user_id: userId,
      interview_id: interviewId,
      kind: "positive_example",
      source_type: "text",
      source_label: label,
      status: "succeeded",
      normalized_markdown: markdown,
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

async function main() {
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));
  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }
  console.log(`Testing with user ${userId}`);

  await resetUser(userId);

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
