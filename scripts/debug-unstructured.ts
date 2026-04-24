import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = "omarns059+2@gmail.com";

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, user_type, email")
    .eq("email", email)
    .maybeSingle();
  console.log("Profile:", JSON.stringify(profile, null, 2));

  if (!profile?.user_id) {
    console.log("No profile — stopping.");
    return;
  }

  const { data: opps, error } = await supabase
    .from("opportunities")
    .select(
      "id, company_name, company_domain, source, stage, score, discovered_at, analysis_id, last_error, enrichment_attempts, score_components",
    )
    .eq("user_id", profile.user_id)
    .ilike("company_name", "%unstructured%");
  console.log("Unstructured opps (any source/stage):");
  console.log(JSON.stringify(opps, null, 2));
  if (error) console.log("Error:", error);

  // Also check watchlist
  const { data: watch } = await supabase
    .from("watchlist")
    .select("id, company_name, created_at")
    .eq("user_id", profile.user_id)
    .ilike("company_name", "%unstructured%");
  console.log("Unstructured watchlist:");
  console.log(JSON.stringify(watch, null, 2));

  // Summarize scored GTM accounts this user has
  const { data: scored } = await supabase
    .from("opportunities")
    .select("company_name, source, stage, score")
    .eq("user_id", profile.user_id)
    .in("source", ["theirstack", "exa-dormant"])
    .order("score", { ascending: false, nullsFirst: false })
    .limit(20);
  console.log("Top GTM opps (theirstack/exa-dormant), any stage:");
  console.log(JSON.stringify(scored, null, 2));
}

main();
