/**
 * Seed default pipeline_config row for the resettable test user.
 *
 * Usage: npx tsx scripts/seed-pipeline-config.ts
 */

import { createClient } from "@supabase/supabase-js";
import { resolveSeedUserTarget } from "./lib/user-target";

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

async function main() {
  const { userId, email } = await resolveSeedUserTarget(supabase);

  const { data, error } = await supabase
    .from("pipeline_config")
    .upsert(
      {
        user_id: userId,
        score_threshold: 70,
        search_queries: ["GTM Engineer", "Growth Engineer", "Revenue Engineer"],
        search_locations: ["San Francisco", "New York", "Remote"],
        daily_send_cap: 10,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error) {
    console.error("Failed to seed pipeline_config:", error.message);
    process.exit(1);
  }

  console.log(`✓ Pipeline config seeded for ${email}:`, data.id);
  console.log(
    `  threshold=${data.score_threshold}, queries=${JSON.stringify(data.search_queries)}, cap=${data.daily_send_cap}`,
  );
}

main();
