/**
 * SPEC-3 Phase 0 regression: normalizeScoringProfile pins job_search output.
 *
 * Seeds the memory_documents + pipeline_config rows that the current
 * job_search normalizer reads, runs normalizeScoringProfile, and asserts the
 * user_scoring_profiles row has the expected derived columns populated.
 *
 * Locks behavior so Phase 1.d's template-dispatch rewrite can't silently
 * change what job_search users get out of the normalizer. When the dispatcher
 * lands, the internal implementation moves into the template module — this
 * test's observable output stays identical.
 *
 * Usage: npx tsx scripts/test-scoring-normalize-per-template.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { normalizeScoringProfile } from "../src/lib/pipeline/scoring-profile";

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
  await supabase.from("user_scoring_profiles").delete().eq("user_id", userId);
}

// extractSection requires `## Heading\n\n<body>` — a blank line between the
// heading and the body is load-bearing. Match the shape the real job_search
// confirm writes.
const PROFILE_CONTENT = `## Positioning

I'm a GTM Engineer working in the devtools and AI-ML space.

## Career Highlights

- 2019-2024: Shipped pipeline across 3 companies
- Series B devtools startup

## Top Proof Points

- Built Compass at Inkeep
- Grew Mira Migo to 3K users
- Closed-loop GTM platform

## Technical Tools

Claude SDK, Node.js, TypeScript, Vercel`;

const DEALBREAKERS_CONTENT = `## Green Flags

- Series A-C, product-led growth
- Small GTM team, technical founders

## Red Flags

- Enterprise-only sales motion
- Agency or consultancy
- No product yet`;

async function seedFixture(userId: string) {
  const now = new Date().toISOString();

  const { error: profErr } = await supabase.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: "user_profile",
      title: "User Profile",
      origin: "onboarding",
      content: PROFILE_CONTENT,
      metadata: {},
      updated_at: now,
    },
    { onConflict: "user_id,document_key" },
  );
  if (profErr) throw new Error(`seed user_profile: ${profErr.message}`);

  const { error: dealErr } = await supabase.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: "user_dealbreakers",
      title: "Dealbreakers",
      origin: "onboarding",
      content: DEALBREAKERS_CONTENT,
      metadata: {},
      updated_at: now,
    },
    { onConflict: "user_id,document_key" },
  );
  if (dealErr) throw new Error(`seed user_dealbreakers: ${dealErr.message}`);

  const { error: cfgErr } = await supabase.from("pipeline_config").upsert(
    {
      user_id: userId,
      score_threshold: 70,
      daily_send_cap: 10,
      search_queries: ["GTM Engineer", "Growth Engineer"],
      search_locations: ["San Francisco", "Remote"],
    },
    { onConflict: "user_id" },
  );
  if (cfgErr) throw new Error(`seed pipeline_config: ${cfgErr.message}`);
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
  await seedFixture(userId);

  console.log("\n--- Running normalizeScoringProfile ---\n");
  await normalizeScoringProfile(supabase, userId);

  const { data: sp, error } = await supabase
    .from("user_scoring_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  assert(!!sp && !error, "user_scoring_profiles row exists");
  if (!sp) {
    console.error("No user_scoring_profiles row — aborting");
    process.exit(1);
  }

  // ── Derived fields ─────────────────────────────────────────────────────
  assert(
    Array.isArray(sp.role_fit_keywords) &&
      sp.role_fit_keywords.includes("gtm engineer"),
    "role_fit_keywords lowercased from search_queries",
  );
  assert(
    sp.seniority_years === 5,
    `seniority_years derived from year range 2019-2024 (got ${sp.seniority_years})`,
  );
  assert(
    Array.isArray(sp.preferred_stages) &&
      sp.preferred_stages.includes("series-a") &&
      sp.preferred_stages.includes("series-b") &&
      sp.preferred_stages.includes("series-c"),
    "preferred_stages expands Series A-C range",
  );
  assert(
    Array.isArray(sp.preferred_domains) && sp.preferred_domains.length > 0,
    "preferred_domains non-empty (matched from profile text)",
  );
  assert(
    Array.isArray(sp.preferred_domains) &&
      (sp.preferred_domains.includes("devtools") ||
        sp.preferred_domains.includes("ai-ml")),
    "preferred_domains includes at least one known vocabulary match",
  );
  assert(
    Array.isArray(sp.tool_familiarity) &&
      sp.tool_familiarity.some((t: string) => t.toLowerCase() === "claude sdk"),
    "tool_familiarity parsed from Technical Tools section",
  );
  assert(
    Array.isArray(sp.proof_points) &&
      sp.proof_points.length > 0 &&
      typeof sp.proof_points[0] === "object" &&
      "text" in sp.proof_points[0],
    "proof_points is an array of {text} objects",
  );
  assert(
    Array.isArray(sp.dealbreaker_patterns) &&
      sp.dealbreaker_patterns.length > 0,
    "dealbreaker_patterns parsed from Red Flags section",
  );

  // ── Structured preferences ─────────────────────────────────────────────
  assert(
    Array.isArray(sp.target_roles) && sp.target_roles.length === 2,
    "target_roles mirrors search_queries",
  );
  assert(
    Array.isArray(sp.target_locations) && sp.target_locations.length === 2,
    "target_locations mirrors search_locations",
  );
  assert(
    Array.isArray(sp.green_flags) && sp.green_flags.length > 0,
    "green_flags parsed from dealbreakers Green Flags",
  );
  assert(
    Array.isArray(sp.red_flags) && sp.red_flags.length > 0,
    "red_flags parsed from dealbreakers Red Flags",
  );

  // ── Idempotency ────────────────────────────────────────────────────────
  console.log("\n--- Re-running for idempotency ---\n");
  await normalizeScoringProfile(supabase, userId);
  const { count } = await supabase
    .from("user_scoring_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assert(count === 1, `exactly one user_scoring_profiles row (got ${count})`);

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
