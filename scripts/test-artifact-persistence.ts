/**
 * SPEC-3 Phase 4.a: artifact persistence across pre-confirm template switches.
 *
 * Before Phase 2.a, onboarding_artifacts.interview_id had ON DELETE CASCADE —
 * so abandoning / deleting a mis-picked interview would destroy the raw
 * artifacts. Phase 2.a's migration relaxed to SET NULL, and Phase 4.a adds
 * the reassign + claim-orphaned primitives that move artifacts between
 * interviews without ever losing content.
 *
 * This test pins two scenarios:
 *
 *   1. Explicit reassign (A → B). Seeds an interview A with one artifact,
 *      creates a new interview B, calls reassignArtifacts(A → B), asserts
 *      the artifact row moved AND normalized_markdown is byte-identical.
 *
 *   2. Claim orphaned. Seeds an interview with an artifact, NULLs the
 *      interview_id (simulating a post-FK-relax interview delete or
 *      explicit disown), creates a new interview, calls
 *      claimOrphanedArtifacts, asserts the orphan was reattached.
 *
 * Usage: npx tsx scripts/test-artifact-persistence.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  claimOrphanedArtifacts,
  reassignArtifacts,
} from "../src/lib/onboarding/artifacts/reassign";

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
    throw new Error(`Failed to create interview: ${error?.message}`);
  }
  return data.id;
}

async function insertArtifact(
  userId: string,
  interviewId: string | null,
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
    throw new Error(`Failed to insert artifact: ${error?.message}`);
  }
  return data.id;
}

async function testExplicitReassign(userId: string) {
  console.log("\n--- Scenario 1: explicit reassign A → B ---\n");
  await resetUser(userId);

  const interviewA = await createInterview(userId, "job_search");
  const interviewB = await createInterview(userId, "icp_definition");

  const originalMarkdown =
    "# Customer A\n\n- Series A devtools, 50 employees, uses Salesforce";
  const artifactId = await insertArtifact(
    userId,
    interviewA,
    "Customer A",
    originalMarkdown,
  );

  const result = await reassignArtifacts(
    supabase,
    userId,
    interviewA,
    interviewB,
  );
  assert(result.ok, `reassign returns ok (error: ${result.error})`);
  assert(result.count === 1, `reassign reports count=1 (got ${result.count})`);

  const { data: after } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id, normalized_markdown, kind, status")
    .eq("id", artifactId)
    .single();

  assert(
    after?.interview_id === interviewB,
    `artifact.interview_id moved to B (got ${after?.interview_id})`,
  );
  assert(
    after?.normalized_markdown === originalMarkdown,
    "normalized_markdown byte-identical after reassign",
  );
  assert(after?.kind === "positive_example", "kind unchanged");
  assert(after?.status === "succeeded", "status unchanged");

  // Idempotency: re-calling with same args should be a no-op.
  const second = await reassignArtifacts(
    supabase,
    userId,
    interviewA,
    interviewB,
  );
  assert(
    second.ok && second.count === 0,
    `second reassign no-op (count=${second.count})`,
  );

  // Equal from/to should short-circuit to 0.
  const noop = await reassignArtifacts(
    supabase,
    userId,
    interviewB,
    interviewB,
  );
  assert(noop.ok && noop.count === 0, "reassign with equal from/to is a no-op");
}

async function testClaimOrphaned(userId: string) {
  console.log("\n--- Scenario 2: claim orphaned ---\n");
  await resetUser(userId);

  const interviewA = await createInterview(userId, "job_search");
  const originalMarkdown = "# Orphan\n\nSome text the user uploaded";
  const artifactId = await insertArtifact(
    userId,
    interviewA,
    "Orphan source",
    originalMarkdown,
  );

  // Simulate an orphan state — as if interview A was deleted (FK SET NULL
  // would produce this) or the artifact was explicitly disowned.
  await supabase
    .from("onboarding_artifacts")
    .update({ interview_id: null })
    .eq("id", artifactId);

  const interviewB = await createInterview(userId, "icp_definition");

  const result = await claimOrphanedArtifacts(supabase, userId, interviewB);
  assert(result.ok, `claim returns ok (error: ${result.error})`);
  assert(result.count === 1, `claim reports count=1 (got ${result.count})`);

  const { data: after } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id, normalized_markdown")
    .eq("id", artifactId)
    .single();

  assert(
    after?.interview_id === interviewB,
    `orphan reattached to B (got ${after?.interview_id})`,
  );
  assert(
    after?.normalized_markdown === originalMarkdown,
    "normalized_markdown preserved through claim",
  );

  // Idempotency: second claim should find no orphans.
  const second = await claimOrphanedArtifacts(supabase, userId, interviewB);
  assert(
    second.ok && second.count === 0,
    `second claim no-op (count=${second.count})`,
  );
}

async function testUserIsolation(userId: string) {
  // Ensure the user_id guard works — reassigning with a wrong user
  // context must not move artifacts that don't belong to that user.
  console.log("\n--- Scenario 3: user-id isolation ---\n");
  await resetUser(userId);

  const interviewA = await createInterview(userId, "job_search");
  const interviewB = await createInterview(userId, "icp_definition");
  const artifactId = await insertArtifact(
    userId,
    interviewA,
    "Mine",
    "content",
  );

  // Attempt the reassign with a bogus user_id.
  const bogusUserId = "00000000-0000-0000-0000-000000000000";
  const result = await reassignArtifacts(
    supabase,
    bogusUserId,
    interviewA,
    interviewB,
  );
  assert(
    result.ok && result.count === 0,
    `wrong-user reassign moves nothing (count=${result.count})`,
  );

  const { data: after } = await supabase
    .from("onboarding_artifacts")
    .select("interview_id")
    .eq("id", artifactId)
    .single();
  assert(
    after?.interview_id === interviewA,
    "artifact stays with the real owner's original interview",
  );
}

async function main() {
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));
  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }
  console.log(`Testing with user ${userId}`);

  await testExplicitReassign(userId);
  await testClaimOrphaned(userId);
  await testUserIsolation(userId);

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
