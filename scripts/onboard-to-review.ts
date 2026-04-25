/**
 * Rewind the current onboarding interview back to the review screen.
 *
 * Unlike onboard:reset, this is non-destructive: it leaves orchestrator state,
 * artifacts, messages, and extracted profile/search/outreach intact. It only
 * flips status back to 'review' and clears extracted.insights so the career
 * story generation step fires fresh.
 *
 * Memory docs, pipeline_config, and user_scoring_profiles are NOT touched —
 * confirm is idempotent (all upserts), so re-confirming will just overwrite.
 *
 * Usage: npx tsx scripts/onboard-to-review.ts
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
  const email = process.env.SEED_USER_EMAIL ?? "omarns059@gmail.com";
  const userId = process.env.SEED_USER_ID ?? (await resolveUserId(email));

  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }

  // Find the most recent job_search interview, any status.
  const { data: interview, error: fetchErr } = await supabase
    .from("onboarding_interviews")
    .select("id, status, template_id, extracted, orchestrator_state")
    .eq("user_id", userId)
    .eq("template_id", "job_search")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) {
    console.error("Failed to fetch interview:", fetchErr.message);
    process.exit(1);
  }

  if (!interview) {
    console.error(
      "No job_search interview found. Run the full onboarding flow first.",
    );
    process.exit(1);
  }

  console.log(`Found interview ${interview.id} (status: ${interview.status})`);

  if (interview.orchestrator_state === null) {
    console.warn(
      "Warning: orchestrator_state is null — this is a legacy (non-agentic) interview.",
    );
    console.warn(
      "Rewinding to review will work, but there will be no orchestrator data for the career story step.",
    );
  }

  const extracted = (interview.extracted ?? {}) as Record<string, unknown>;
  const hadInsights = extracted.insights != null;

  // Strip insights from the unified column without disturbing
  // profile/search/outreach.
  const { insights: _insights, ...extractedWithoutInsights } = extracted;

  const { error: updateErr } = await supabase
    .from("onboarding_interviews")
    .update({
      status: "review",
      extracted: extractedWithoutInsights,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interview.id);

  if (updateErr) {
    console.error("Failed to rewind interview:", updateErr.message);
    process.exit(1);
  }

  console.log(`Rewound to review.`);
  if (hadInsights) {
    console.log(`  extracted.insights cleared — career story step will fire.`);
  } else {
    console.log(
      `  extracted.insights was already null — career story step was already pending.`,
    );
  }
  console.log(`  orchestrator_state, artifacts, messages unchanged.`);
  console.log(`  memory_documents, pipeline_config untouched.`);
  console.log(`\nOpen /onboard in the browser.`);
}

main();
