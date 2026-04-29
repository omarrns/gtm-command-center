/**
 * SPEC-3 Phase 0 regression: isOnboardingComplete pins job_search behavior.
 *
 * Locks the current 3-row check (user_profile memory doc, pipeline_config,
 * feedback_outreach_style memory doc) so Phase 1.c's template-aware rewrite
 * can't silently change what counts as "complete" for a job_search user.
 *
 * Phase 1.c will widen the signature to accept a `userType` argument; this
 * test's call site updates with that commit. The assertions stay the same —
 * a seeded job_search user is still complete.
 *
 * Usage: npx tsx scripts/test-onboarding-complete-per-template.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { isOnboardingComplete } from "../src/lib/pipeline/onboarding";

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
  if (condition) {
    console.log(`  PASS: ${label}`);
  } else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

async function resetUser(userId: string) {
  await supabase
    .from("memory_documents")
    .delete()
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  await supabase.from("pipeline_config").delete().eq("user_id", userId);
}

async function seedProfile(userId: string) {
  const { error } = await supabase.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: "user_profile",
      title: "User Profile",
      origin: "onboarding",
      content: "## Positioning\nTest\n\n## Career Highlights\n- one",
      metadata: {},
    },
    { onConflict: "user_id,document_key" },
  );
  if (error) throw new Error(`seedProfile: ${error.message}`);
}

async function seedOutreach(userId: string) {
  const { error } = await supabase.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: "feedback_outreach_style",
      title: "Outreach Style",
      origin: "onboarding",
      content: "## Outreach Tone\nCasual",
      metadata: {},
    },
    { onConflict: "user_id,document_key" },
  );
  if (error) throw new Error(`seedOutreach: ${error.message}`);
}

async function seedConfig(userId: string) {
  const { error } = await supabase.from("pipeline_config").upsert(
    {
      user_id: userId,
      score_threshold: 70,
      daily_send_cap: 10,
      search_queries: ["Software Engineer"],
      search_locations: ["Remote"],
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`seedConfig: ${error.message}`);
}

async function main() {
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));

  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }

  console.log(`Testing with user ${userId}`);

  // ── Empty state ────────────────────────────────────────────────────────
  console.log("\n--- Empty state (no seeded rows) ---\n");
  await resetUser(userId);
  const empty = await isOnboardingComplete(supabase, userId);
  assert(empty.complete === false, "empty state is not complete");
  assert(
    empty.completedSteps.length === 0,
    "empty state has 0 completed steps",
  );

  // ── Step 1 only (user_profile) ─────────────────────────────────────────
  console.log("\n--- Step 1 only (user_profile) ---\n");
  await seedProfile(userId);
  const step1 = await isOnboardingComplete(supabase, userId);
  assert(step1.complete === false, "step1-only is not complete");
  assert(
    JSON.stringify(step1.completedSteps) === JSON.stringify([1]),
    `step1-only reports [1] (got ${JSON.stringify(step1.completedSteps)})`,
  );

  // ── Step 1 + 2 (profile + pipeline_config) ─────────────────────────────
  console.log("\n--- Steps 1 + 2 (profile + pipeline_config) ---\n");
  await seedConfig(userId);
  const step12 = await isOnboardingComplete(supabase, userId);
  assert(step12.complete === false, "steps 1+2 is not complete");
  assert(
    JSON.stringify(step12.completedSteps) === JSON.stringify([1, 2]),
    `steps 1+2 reports [1,2] (got ${JSON.stringify(step12.completedSteps)})`,
  );

  // ── All three steps ────────────────────────────────────────────────────
  console.log("\n--- All three steps ---\n");
  await seedOutreach(userId);
  const full = await isOnboardingComplete(supabase, userId);
  assert(full.complete === true, "all three steps = complete");
  assert(
    JSON.stringify(full.completedSteps) === JSON.stringify([1, 2, 3]),
    `all steps reports [1,2,3] (got ${JSON.stringify(full.completedSteps)})`,
  );

  // Clean up so CI runs are idempotent.
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
