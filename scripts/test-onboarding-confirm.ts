/**
 * Regression test: confirm path DB writes
 *
 * Seeds a review-state onboarding_interviews row, calls performConfirm() with
 * a known ConfirmEdits payload, then asserts the 5 memory_documents +
 * pipeline_config + user_scoring_profiles rows exist with expected content.
 * Re-runs the confirm to verify idempotency.
 *
 * This is the Phase 1 template-abstraction refactor's regression guardrail.
 * It must pass before the refactor starts and after every meaningful commit.
 *
 * Usage: npx tsx scripts/test-onboarding-confirm.ts
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

const EDITS_FIXTURE = {
  profile: {
    positioning:
      "I'm a GTM Engineer who builds pipeline through data, APIs, and automation",
    careerHighlights:
      "- Built Compass at Inkeep: 400K+ impressions, 50+ enterprise leads\n- Grew Mira Migo to 3K users, $6K MRR peak\n- 500 Global: automated 500+ investor updates/month",
    proofPoints:
      "- Closed-loop GTM platform from Gong calls to attribution\n- Built and sold Compresso in 1 week\n- 100x GEO growth through experimentation",
    technicalTools:
      "Claude SDK, Claude API, Node.js, TypeScript, Vercel, PostHog, n8n, Exa, Firecrawl",
  },
  search: {
    searchQueries: ["GTM Engineer", "Growth Engineer"],
    searchLocations: ["San Francisco", "Remote"],
    scoreThreshold: 70,
    dailySendCap: 10,
  },
  outreach: {
    greenFlags:
      "Series A-C, product-led growth, small GTM team, technical founders",
    redFlags:
      "Enterprise-only sales motion, no product yet, agency/consultancy",
    outreachTone: "casual" as const,
    whatsWorked:
      "Peer frame over applicant frame, simple binary asks, conversational tone",
    whatToAvoid:
      "Long intros, flattery, bullet-heavy emails, 'I noticed you...' openers",
  },
};

const EXTRACTED_INSIGHTS_FIXTURE = {
  career_narrative:
    "Omar's career is a single thesis: unstructured data → structured intelligence → decision-ready output.",
  decision_drivers: [
    "Wants to build, not execute someone else's playbook",
    "Needs a company with a real data/intelligence problem to solve",
  ],
  unstated_preferences: ["Prefers small teams where he can own the GTM stack"],
  strongest_stories: [
    "Compass: full closed-loop from Gong calls to attribution",
    "Mira Migo: built from scratch to 3K users with zero paid spend",
  ],
  positioning_alternatives: ["Growth Engineer who builds intelligence systems"],
  risk_tolerance: "Moderately selective",
  communication_style_notes: "Direct, casual, internet-native.",
};

async function resetUser(userId: string) {
  await supabase.from("onboarding_interviews").delete().eq("user_id", userId);
  await supabase
    .from("memory_documents")
    .delete()
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  await supabase.from("pipeline_config").delete().eq("user_id", userId);
  await supabase.from("user_scoring_profiles").delete().eq("user_id", userId);
}

async function seedReviewInterview(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("onboarding_interviews")
    .insert({
      user_id: userId,
      is_refresh: false,
      template_id: "job_search",
      template_version: "v1",
      status: "review",
      messages: [],
      topics_covered: [
        "identity",
        "career",
        "proof_points",
        "tools",
        "search_prefs",
        "dealbreakers",
        "outreach_style",
      ],
      ready_for_extraction: true,
      extracted_profile: EDITS_FIXTURE.profile,
      extracted_search: EDITS_FIXTURE.search,
      extracted_outreach: EDITS_FIXTURE.outreach,
      extracted_insights: EXTRACTED_INSIGHTS_FIXTURE,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to seed review interview: ${error?.message ?? "no row"}`,
    );
  }
  return data.id;
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

async function assertExpectedDbState(userId: string, interviewId: string) {
  // Memory documents
  const { data: memDocs } = await supabase
    .from("memory_documents")
    .select("document_key, content")
    .eq("user_id", userId)
    .eq("origin", "onboarding");

  const byKey = new Map(
    (memDocs ?? []).map((d: { document_key: string; content: string }) => [
      d.document_key,
      d.content,
    ]),
  );

  assert(byKey.has("user_profile"), "memory_documents[user_profile] exists");
  assert(
    byKey.has("user_positioning"),
    "memory_documents[user_positioning] exists",
  );
  assert(
    byKey.has("user_dealbreakers"),
    "memory_documents[user_dealbreakers] exists",
  );
  assert(
    byKey.has("feedback_outreach_style"),
    "memory_documents[feedback_outreach_style] exists",
  );
  assert(
    byKey.has("interview_insights"),
    "memory_documents[interview_insights] exists",
  );

  const profileContent = byKey.get("user_profile") ?? "";
  assert(
    profileContent.includes("## Positioning"),
    "user_profile has ## Positioning section",
  );
  assert(
    profileContent.includes("## Career Highlights"),
    "user_profile has ## Career Highlights section",
  );
  assert(
    profileContent.includes("## Top Proof Points"),
    "user_profile has ## Top Proof Points section",
  );

  const outreachContent = byKey.get("feedback_outreach_style") ?? "";
  assert(
    outreachContent.startsWith("## Outreach Tone"),
    "feedback_outreach_style starts with ## Outreach Tone",
  );
  assert(
    outreachContent.includes("Casual"),
    "feedback_outreach_style includes tone label",
  );

  // pipeline_config
  const { data: config } = await supabase
    .from("pipeline_config")
    .select("score_threshold, daily_send_cap, search_queries, search_locations")
    .eq("user_id", userId)
    .maybeSingle();

  assert(!!config, "pipeline_config row exists");
  if (config) {
    assert(config.score_threshold === 70, "pipeline_config.score_threshold=70");
    assert(config.daily_send_cap === 10, "pipeline_config.daily_send_cap=10");
    assert(
      JSON.stringify(config.search_queries) ===
        JSON.stringify(["GTM Engineer", "Growth Engineer"]),
      "pipeline_config.search_queries matches fixture",
    );
    assert(
      JSON.stringify(config.search_locations) ===
        JSON.stringify(["San Francisco", "Remote"]),
      "pipeline_config.search_locations matches fixture",
    );
  }

  // user_scoring_profiles
  const { data: sp } = await supabase
    .from("user_scoring_profiles")
    .select("target_roles, preferred_stages")
    .eq("user_id", userId)
    .maybeSingle();

  assert(!!sp, "user_scoring_profiles row exists");
  if (sp) {
    assert(
      Array.isArray(sp.target_roles) && sp.target_roles.length > 0,
      "user_scoring_profiles.target_roles non-empty",
    );
    assert(
      Array.isArray(sp.preferred_stages) && sp.preferred_stages.length > 0,
      "user_scoring_profiles.preferred_stages non-empty (vocabulary expanded)",
    );
  }

  // onboarding_interviews status + template identity
  const { data: interview } = await supabase
    .from("onboarding_interviews")
    .select("status, template_id, template_version")
    .eq("id", interviewId)
    .single();

  assert(
    interview?.status === "confirmed",
    "onboarding_interviews.status='confirmed'",
  );
  // SPEC-3 Phase 0 guardrail: confirm must not mutate template identity.
  // If Phase 1+ changes anything here, we'll know before the persona picker
  // ships.
  assert(
    interview?.template_id === "job_search",
    `onboarding_interviews.template_id unchanged at 'job_search' (got ${interview?.template_id})`,
  );
  assert(
    interview?.template_version === "v1",
    `onboarding_interviews.template_version unchanged at 'v1' (got ${interview?.template_version})`,
  );

  // SPEC-3 Phase 3.a: confirm writes profiles.user_type from the template.
  // job_search → 'job_seeker'. This asserts the write-timing rule: the
  // persona is stamped exactly at confirm, nowhere earlier.
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("user_id", userId)
    .single();
  assert(
    profile?.user_type === "job_seeker",
    `profiles.user_type='job_seeker' (got ${profile?.user_type})`,
  );
}

async function assertNoDuplicates(userId: string) {
  const { count: memCount } = await supabase
    .from("memory_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  assert(
    memCount === 5,
    `memory_documents count is exactly 5 (got ${memCount})`,
  );

  const { count: configCount } = await supabase
    .from("pipeline_config")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assert(
    configCount === 1,
    `pipeline_config count is exactly 1 (got ${configCount})`,
  );

  const { count: spCount } = await supabase
    .from("user_scoring_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assert(
    spCount === 1,
    `user_scoring_profiles count is exactly 1 (got ${spCount})`,
  );
}

async function main() {
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));

  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }

  console.log(`Testing with user ${userId}`);
  console.log("Resetting onboarding state...");
  await resetUser(userId);

  console.log("Seeding review-state interview...");
  const interviewId = await seedReviewInterview(userId);
  console.log(`Interview id: ${interviewId}\n`);

  console.log("Loading performConfirm...");
  const { performConfirm } =
    await import("../src/app/(app)/onboard/confirm-logic");

  console.log("First confirm run...");
  const first = await performConfirm(
    supabase,
    userId,
    interviewId,
    EDITS_FIXTURE,
  );
  assert(first.ok, `first performConfirm returns ok (error: ${first.error})`);
  if (!first.ok) {
    console.error("First confirm failed — aborting assertions");
    process.exit(1);
  }

  console.log("\n--- Asserting DB state after first confirm ---\n");
  await assertExpectedDbState(userId, interviewId);

  // Re-seed to review so we can confirm again (status was flipped to confirmed)
  console.log("\nReverting to review for idempotency check...");
  await supabase
    .from("onboarding_interviews")
    .update({ status: "review" })
    .eq("id", interviewId);

  console.log("Second confirm run (idempotency check)...");
  const second = await performConfirm(
    supabase,
    userId,
    interviewId,
    EDITS_FIXTURE,
  );
  assert(
    second.ok,
    `second performConfirm returns ok (error: ${second.error})`,
  );

  console.log("\n--- Asserting no duplicate rows ---\n");
  await assertNoDuplicates(userId);

  console.log("\n--- Asserting DB state after second confirm ---\n");
  await assertExpectedDbState(userId, interviewId);

  console.log(
    `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
