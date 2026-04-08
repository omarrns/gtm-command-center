/**
 * Create onboarding fixture data for testing.
 *
 * Usage:
 *   npx tsx scripts/onboard-fixture.ts --state=partial   # Step 1 docs only (wizard resumes at Step 2)
 *   npx tsx scripts/onboard-fixture.ts --state=complete   # All docs + config (gate passes)
 *   npx tsx scripts/onboard-fixture.ts --state=empty      # Alias for onboard:reset
 */

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

// Parse --state=<value> from argv
function parseState(): "partial" | "complete" | "empty" {
  const arg = process.argv.find((a) => a.startsWith("--state="));
  const value = arg?.split("=")[1];
  if (value === "partial" || value === "complete" || value === "empty") {
    return value;
  }
  console.error("Usage: --state=partial | --state=complete | --state=empty");
  process.exit(1);
}

async function resetUser(userId: string) {
  await supabase
    .from("memory_documents")
    .delete()
    .eq("user_id", userId)
    .eq("origin", "onboarding");

  await supabase.from("pipeline_config").delete().eq("user_id", userId);

  // Phase 9: also clear derived scoring profile
  await supabase.from("user_scoring_profiles").delete().eq("user_id", userId);
}

async function main() {
  const state = parseState();
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));

  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }

  // Always reset first
  await resetUser(userId);

  if (state === "empty") {
    console.log("Reset to empty state (no onboarding data)");
    return;
  }

  // Step 1: user_profile + user_positioning
  const step1Docs = [
    {
      user_id: userId,
      document_key: "user_profile",
      title: "User Profile",
      origin: "onboarding",
      content:
        "## Positioning\n\nI'm a GTM Engineer who builds pipeline through data, APIs, and automation\n\n---\n\n## Career Highlights\n\n- Built Compass: 400K+ impressions, 50+ enterprise leads\n- Grew Mira Migo to 3K users, $6K MRR peak\n- 500 Global: automated 500+ investor updates/month\n\n---\n\n## Top Proof Points\n\n- Closed-loop GTM platform from Gong calls to attribution\n- Built and sold Compresso in 1 week\n- 100x GEO growth through experimentation\n\n---\n\n## Technical Tools\n\nClaude SDK, Node.js, TypeScript, PostHog, n8n, Vercel",
      metadata: {},
    },
    {
      user_id: userId,
      document_key: "user_positioning",
      title: "User Positioning",
      origin: "onboarding",
      content:
        "## Positioning Statement\n\nI'm a GTM Engineer who builds pipeline through data, APIs, and automation\n\n---\n\n## What Makes Me Distinct\n\n- Closed-loop GTM platform from Gong calls to attribution\n- Built and sold Compresso in 1 week\n- 100x GEO growth through experimentation",
      metadata: {},
    },
  ];

  const { error: step1Error } = await supabase
    .from("memory_documents")
    .upsert(step1Docs, { onConflict: "user_id,document_key" });

  if (step1Error) {
    console.error("Failed to insert Step 1 docs:", step1Error.message);
    process.exit(1);
  }

  console.log("Step 1 docs created (user_profile + user_positioning)");

  if (state === "partial") {
    console.log("Partial state: wizard will resume at Step 2");
    return;
  }

  // Step 2: pipeline_config
  const { error: configError } = await supabase.from("pipeline_config").upsert(
    {
      user_id: userId,
      score_threshold: 70,
      search_queries: ["GTM Engineer", "Growth Engineer"],
      search_locations: ["San Francisco", "New York"],
      daily_send_cap: 10,
    },
    { onConflict: "user_id" },
  );

  if (configError) {
    console.error("Failed to insert pipeline_config:", configError.message);
    process.exit(1);
  }

  console.log("Step 2 config created (pipeline_config)");

  // Step 3: user_dealbreakers + feedback_outreach_style
  const step3Docs = [
    {
      user_id: userId,
      document_key: "user_dealbreakers",
      title: "User Dealbreakers",
      origin: "onboarding",
      content:
        "## Green Flags\n\nSeries A-C, product-led growth, small GTM team, technical founders\n\n---\n\n## Red Flags\n\nEnterprise-only sales motion, no product yet, agency/consultancy",
      metadata: {},
    },
    {
      user_id: userId,
      document_key: "feedback_outreach_style",
      title: "Outreach Style",
      origin: "onboarding",
      content:
        "## Outreach Tone\n\nCasual — conversational, internet-native, fewer bullets\n\n---\n\n## What's Worked\n\nPeer frame over applicant frame, simple binary asks\n\n---\n\n## What to Avoid\n\nLong intros, flattery, bullet-heavy emails",
      metadata: {},
    },
  ];

  const { error: step3Error } = await supabase
    .from("memory_documents")
    .upsert(step3Docs, { onConflict: "user_id,document_key" });

  if (step3Error) {
    console.error("Failed to insert Step 3 docs:", step3Error.message);
    process.exit(1);
  }

  console.log(
    "Step 3 docs created (user_dealbreakers + feedback_outreach_style)",
  );

  // Phase 9: derive scoring profile from fixture data and verify
  const { normalizeScoringProfile } =
    await import("../src/lib/pipeline/scoring-profile");
  await normalizeScoringProfile(supabase, userId);

  const { data: sp } = await supabase
    .from("user_scoring_profiles")
    .select(
      "id, preferred_stages, tool_familiarity, target_roles, dealbreaker_patterns",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!sp) {
    console.error("FAIL: normalization produced no user_scoring_profiles row");
    process.exit(1);
  }

  // Fixture green flags include "Series A-C" — assert vocabulary expansion
  const expectedStages = ["series-a", "series-b", "series-c"];
  const missingStages = expectedStages.filter(
    (s) => !sp.preferred_stages.includes(s),
  );
  if (missingStages.length > 0) {
    console.error(
      `FAIL: preferred_stages missing expected values: ${JSON.stringify(missingStages)} (got ${JSON.stringify(sp.preferred_stages)})`,
    );
    process.exit(1);
  }

  // target_roles should match fixture search_queries
  if (sp.target_roles.length === 0) {
    console.error(
      "FAIL: target_roles is empty — pipeline_config not picked up",
    );
    process.exit(1);
  }

  console.log(
    `Scoring profile verified: stages=${JSON.stringify(sp.preferred_stages)}, tools=${JSON.stringify(sp.tool_familiarity)}, roles=${JSON.stringify(sp.target_roles)}`,
  );

  console.log("Complete state: onboarding gate will pass, Today loads");
}

main();
