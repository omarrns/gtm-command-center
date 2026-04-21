/**
 * Reset onboarding state for the current user.
 *
 * Deletes pipeline_config row and onboarding-origin memory_documents.
 * Only for local development — not exposed via UI or API.
 *
 * Usage: npx tsx scripts/onboard-reset.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

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

async function main() {
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));

  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }

  // Delete onboarding_artifacts first (SPEC-2). interview_id cascades when
  // the interview row is deleted, but artifacts with no interview_id
  // (unlikely but possible) won't — hit both for completeness.
  const { count: artifactCount, error: artifactError } = await supabase
    .from("onboarding_artifacts")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (artifactError) {
    console.error("Failed to delete artifacts:", artifactError.message);
    process.exit(1);
  }

  // Delete onboarding interviews (Phase 10)
  const { count: interviewCount, error: interviewError } = await supabase
    .from("onboarding_interviews")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (interviewError) {
    console.error("Failed to delete interviews:", interviewError.message);
    process.exit(1);
  }

  // Delete onboarding-origin memory docs
  const { count: memCount, error: memError } = await supabase
    .from("memory_documents")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("origin", "onboarding");

  if (memError) {
    console.error("Failed to delete memory docs:", memError.message);
    process.exit(1);
  }

  // Delete pipeline_config
  const { count: configCount, error: configError } = await supabase
    .from("pipeline_config")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (configError) {
    console.error("Failed to delete pipeline_config:", configError.message);
    process.exit(1);
  }

  // Delete user_scoring_profiles (Phase 9)
  const { count: spCount, error: spError } = await supabase
    .from("user_scoring_profiles")
    .delete({ count: "exact" })
    .eq("user_id", userId);

  if (spError) {
    console.error("Failed to delete scoring profile:", spError.message);
    process.exit(1);
  }

  console.log(
    `Reset complete: ${artifactCount ?? 0} artifacts, ${interviewCount ?? 0} interviews, ${memCount ?? 0} memory docs, ${configCount ?? 0} config rows, ${spCount ?? 0} scoring profiles deleted`,
  );
}

main();
