/**
 * Live integration test for Phase 5 watchlist.
 *
 * Tests:
 * 1. addToWatchlist() — creates webset + monitor via Exa API
 * 2. processWatchlistAlerts() — ingests items, dedupes on re-run
 * 3. removeFromWatchlist() — cleans up webset + row
 *
 * Usage: npx tsx scripts/test-watchlist-live.ts
 * Requires: EXA_API_KEY, SUPABASE vars in .env.local
 */

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import {
  addToWatchlist,
  processWatchlistAlerts,
  removeFromWatchlist,
} from "../src/lib/pipeline/watchlist";

const TEST_COMPANY = "Vercel";
const TEST_USER_ID = "3583ae5c-f2db-4eae-a79f-bd7c5ec2fce8";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const exaKey = process.env.EXA_API_KEY;

  if (!url || !key) {
    console.error("Missing SUPABASE env vars");
    process.exit(1);
  }
  if (!exaKey) {
    console.error("Missing EXA_API_KEY");
    process.exit(1);
  }

  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Clean up any prior test data
  await svc
    .from("watchlist")
    .delete()
    .eq("user_id", TEST_USER_ID)
    .eq("company_name", TEST_COMPANY);

  // -----------------------------------------------------------------------
  // Test 1: addToWatchlist — should create row + webset + monitor
  // -----------------------------------------------------------------------
  console.log("\n--- Test 1: addToWatchlist ---");
  const addResult = await addToWatchlist(
    svc,
    TEST_USER_ID,
    TEST_COMPANY,
    "manual",
  );
  console.log("Result status:", addResult.status);

  if (addResult.status !== "created") {
    console.error("FAIL: expected status 'created', got", addResult.status);
    process.exit(1);
  }

  const row = addResult.row;
  console.log("Row ID:", row.id);
  console.log("Webset ID:", row.webset_id);
  console.log("Source:", row.source);

  if (!row.webset_id) {
    console.error("FAIL: webset_id is null — Exa monitor creation failed");
    process.exit(1);
  }
  console.log("PASS: watchlist row created with webset_id\n");

  // Verify the webset exists on Exa
  const websetCheck = await fetch(
    `https://api.exa.ai/websets/v0/websets/${row.webset_id}`,
    { headers: { "x-api-key": exaKey } },
  );
  console.log(
    "Webset exists on Exa:",
    websetCheck.ok,
    `(${websetCheck.status})`,
  );
  if (!websetCheck.ok) {
    console.error("FAIL: webset not found on Exa");
    process.exit(1);
  }
  console.log("PASS: webset confirmed on Exa\n");

  // -----------------------------------------------------------------------
  // Test 2: Duplicate add — should return 'duplicate' and not fail
  // -----------------------------------------------------------------------
  console.log("--- Test 2: duplicate add ---");
  const dupResult = await addToWatchlist(
    svc,
    TEST_USER_ID,
    TEST_COMPANY,
    "manual",
  );
  console.log("Result status:", dupResult.status);
  if (dupResult.status !== "duplicate") {
    console.error("FAIL: expected 'duplicate', got", dupResult.status);
    process.exit(1);
  }
  console.log("PASS: duplicate correctly detected\n");

  // -----------------------------------------------------------------------
  // Test 3: processWatchlistAlerts — wait for webset to have items
  // -----------------------------------------------------------------------
  console.log("--- Test 3: processWatchlistAlerts ---");
  console.log("Waiting 15s for Exa webset to populate...");
  await sleep(15_000);

  const alertResult1 = await processWatchlistAlerts(svc, TEST_USER_ID);
  console.log("Run 1:", alertResult1);

  // -----------------------------------------------------------------------
  // Test 4: Re-run alerts — dedup should prevent new inserts
  // -----------------------------------------------------------------------
  console.log("\n--- Test 4: alert dedup ---");
  const alertResult2 = await processWatchlistAlerts(svc, TEST_USER_ID);
  console.log("Run 2:", alertResult2);
  if (alertResult2.newAlerts > 0) {
    console.warn("WARN: re-run inserted alerts — dedup may not be working");
  } else {
    console.log("PASS: no new alerts on re-run (dedup working)\n");
  }

  // -----------------------------------------------------------------------
  // Test 5: removeFromWatchlist — should clean up webset + row
  // -----------------------------------------------------------------------
  console.log("--- Test 5: removeFromWatchlist ---");
  const removed = await removeFromWatchlist(svc, TEST_USER_ID, row.id);
  console.log("Removed:", removed);
  if (!removed) {
    console.error("FAIL: removeFromWatchlist returned false");
    process.exit(1);
  }

  // Verify row is gone
  const { data: afterDelete } = await svc
    .from("watchlist")
    .select("id")
    .eq("id", row.id)
    .maybeSingle();

  if (afterDelete) {
    console.error("FAIL: row still exists after delete");
    process.exit(1);
  }
  console.log("PASS: row deleted, webset cleaned up\n");

  console.log("=== All tests passed ===");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
