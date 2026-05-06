/**
 * Read-only diagnostic for a job-search user's onboarding/activation gates.
 *
 * Usage:
 *   npx tsx scripts/check-job-search-readiness.ts --email user@example.com
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

function parseEmail(): string {
  const emailFlagIndex = process.argv.findIndex((arg) => arg === "--email");
  const equalsFlag = process.argv.find((arg) => arg.startsWith("--email="));
  const value =
    equalsFlag?.split("=")[1] ??
    (emailFlagIndex >= 0 ? process.argv[emailFlagIndex + 1] : undefined) ??
    process.env.SEED_USER_EMAIL;
  if (!value) {
    console.error("Usage: npx tsx scripts/check-job-search-readiness.ts --email <email>");
    process.exit(1);
  }
  return value.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

async function countRows(table: string, userId: string, filters = {}) {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const { count, error } = await query;
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function main() {
  const email = parseEmail();

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, email, is_enabled, user_type")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Profile lookup failed: ${profileError.message}`);
  }

  console.log(`Email: ${email}`);
  console.log(`Profile exists: ${!!profile}`);

  if (!profile) {
    console.log("Expected route: /onboard");
    return;
  }

  const userId = profile.user_id as string;
  const userType = (profile.user_type as string | null) ?? null;
  console.log(`User ID: ${userId}`);

  const [
    onboarding,
    userProfileCount,
    outreachCount,
    positioningCount,
    { data: pipelineConfig, error: configError },
    { data: interviews, error: interviewsError },
  ] = await Promise.all([
    isOnboardingComplete(supabase, userId, "job_seeker"),
    countRows("memory_documents", userId, { document_key: "user_profile" }),
    countRows("memory_documents", userId, {
      document_key: "feedback_outreach_style",
    }),
    countRows("memory_documents", userId, { document_key: "user_positioning" }),
    supabase
      .from("pipeline_config")
      .select("id, activation_completed_at, score_threshold, search_queries, search_locations")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("onboarding_interviews")
      .select("id, template_id, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (configError) throw new Error(`pipeline_config failed: ${configError.message}`);
  if (interviewsError) {
    throw new Error(`onboarding_interviews failed: ${interviewsError.message}`);
  }

  const activationCompletedAt =
    (pipelineConfig?.activation_completed_at as string | null | undefined) ??
    null;
  const expectedRoute = !onboarding.complete
    ? "/onboard"
    : activationCompletedAt
      ? "/"
      : "/activate";

  console.log(`Enabled: ${Boolean(profile.is_enabled)}`);
  console.log(`User type: ${userType ?? "null"}`);
  console.log("Job-search requirements:");
  console.log(`  user_profile memory doc: ${userProfileCount > 0}`);
  console.log(`  feedback_outreach_style memory doc: ${outreachCount > 0}`);
  console.log(`  user_positioning memory doc: ${positioningCount > 0}`);
  console.log(`  pipeline_config: ${!!pipelineConfig}`);
  console.log(
    `Onboarding complete: ${onboarding.complete} (steps: ${onboarding.completedSteps.join(",") || "none"})`,
  );
  console.log(`Activation completed at: ${activationCompletedAt ?? "null"}`);
  console.log("Pipeline config:");
  console.log(JSON.stringify(pipelineConfig ?? null, null, 2));
  console.log("Onboarding interviews:");
  console.log(JSON.stringify(interviews ?? [], null, 2));
  console.log(`Expected route: ${expectedRoute}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
