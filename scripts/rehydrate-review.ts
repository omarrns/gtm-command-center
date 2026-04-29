/**
 * Re-run the confirm adapter over an existing interview's orchestrator_state
 * and write the result to the unified `extracted` column + status='review'.
 *
 * Use when the adapter logic changed (e.g., added array-to-bullets coercion)
 * and an existing interview's extracted column holds stale/empty values
 * that need to be re-derived without a full onboard:reset.
 *
 * Usage: npx tsx scripts/rehydrate-review.ts <email>
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { toJobSearchConfirmEdits } from "../src/lib/onboarding/orchestrator/to-confirm-edits";
import type { OrchestratorState } from "../src/lib/onboarding/orchestrator/types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: npx tsx scripts/rehydrate-review.ts <email>");
    process.exit(1);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .single();
  if (!profile) {
    console.error(`no profile for ${email}`);
    process.exit(1);
  }

  const { data: interview } = await supabase
    .from("onboarding_interviews")
    .select("id, status, orchestrator_state")
    .eq("user_id", profile.user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!interview?.orchestrator_state) {
    console.error("no interview or orchestrator_state");
    process.exit(1);
  }

  const state = interview.orchestrator_state as OrchestratorState;
  const { edits } = toJobSearchConfirmEdits(state);

  console.log(
    `rehydrating interview ${interview.id} (status: ${interview.status})`,
  );
  console.log("\n--- new extracted.profile ---");
  console.log(JSON.stringify(edits.profile, null, 2));
  console.log("\n--- new extracted.outreach ---");
  console.log(JSON.stringify(edits.outreach, null, 2));

  const { error } = await supabase
    .from("onboarding_interviews")
    .update({
      status: "review",
      extracted: edits,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interview.id);

  if (error) {
    console.error("update failed:", error.message);
    process.exit(1);
  }

  console.log("\ninterview updated. refresh the browser.");
}

main();
