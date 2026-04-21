/**
 * SPEC-2 Phase 5 regression test: confirm adapter
 *
 * Asserts that toJobSearchConfirmEdits produces:
 *   1. A JobSearchEdits shape that mirrors orchestrator_state.dimensions values
 *      when no user edits are supplied.
 *   2. The correct metrics.reviewEdits diff when user edits differ from the
 *      orchestrator's inferred values.
 *   3. When fed into the unchanged performConfirm pipeline, the same memory
 *      docs + pipeline_config + user_scoring_profiles shape as the legacy
 *      path produces (minus interview_insights, which the orchestrator
 *      doesn't generate — that memory doc is legitimately skipped).
 *
 * Usage: npx tsx scripts/test-confirm-adapter.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { toJobSearchConfirmEdits } from "../src/lib/onboarding/orchestrator/to-confirm-edits";
import type { OrchestratorState } from "../src/lib/onboarding/orchestrator/types";

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

function buildStateFromFixture(): OrchestratorState {
  const now = new Date().toISOString();
  const dim = (value: unknown, confidence = 0.85) => ({
    value,
    summary: `inferred: ${String(value).slice(0, 80)}`,
    confidence,
    threshold: 0.75,
    status: "answered" as const,
    provenance: [],
    updatedAt: now,
  });

  return {
    version: 1,
    templateId: "job_search",
    status: "ready_for_review",
    artifacts: [],
    dimensions: {
      positioning: dim(
        "I'm a GTM Engineer who builds pipeline through data, APIs, and automation",
      ),
      careerHighlights: dim(
        "- Built Compass at Inkeep: 400K+ impressions, 50+ enterprise leads\n- Grew Mira Migo to 3K users, $6K MRR peak\n- 500 Global: automated 500+ investor updates/month",
      ),
      proofPoints: dim(
        "- Closed-loop GTM platform from Gong calls to attribution\n- Built and sold Compresso in 1 week\n- 100x GEO growth through experimentation",
      ),
      technicalTools: dim(
        "Claude SDK, Claude API, Node.js, TypeScript, Vercel, PostHog, n8n, Exa, Firecrawl",
      ),
      searchQueries: dim(["GTM Engineer", "Growth Engineer"]),
      searchLocations: dim(["San Francisco", "Remote"]),
      scoreThreshold: dim(70),
      dailySendCap: dim(10),
      greenFlags: dim(
        "Series A-C, product-led growth, small GTM team, technical founders",
      ),
      redFlags: dim(
        "Enterprise-only sales motion, no product yet, agency/consultancy",
      ),
      outreachTone: dim("casual"),
      whatsWorked: dim(
        "Peer frame over applicant frame, simple binary asks, conversational tone",
      ),
      whatToAvoid: dim(
        "Long intros, flattery, bullet-heavy emails, 'I noticed you...' openers",
      ),
    },
    activeDimensionKey: null,
    nextDimensionKey: null,
    askedDimensionKeys: [],
    metrics: {
      questionCount: 3,
      artifactSuccessCount: 2,
      artifactFailureCount: 0,
      reviewEdits: [],
    },
  };
}

async function resetUser(userId: string) {
  await supabase.from("onboarding_artifacts").delete().eq("user_id", userId);
  await supabase.from("onboarding_interviews").delete().eq("user_id", userId);
  await supabase
    .from("memory_documents")
    .delete()
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  await supabase.from("pipeline_config").delete().eq("user_id", userId);
  await supabase.from("user_scoring_profiles").delete().eq("user_id", userId);
}

async function main() {
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));

  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }

  console.log(`Testing with user ${userId}`);

  // ── Unit: adapter passthrough ──────────────────────────────────────────
  console.log("\n--- Unit: adapter passthrough (no user edits) ---\n");
  const state = buildStateFromFixture();
  const { edits, reviewEdits } = toJobSearchConfirmEdits(state);

  assert(
    edits.profile.positioning.startsWith("I'm a GTM Engineer"),
    "edits.profile.positioning pulled from dimension",
  );
  assert(
    edits.profile.careerHighlights.includes("Compass at Inkeep"),
    "edits.profile.careerHighlights pulled from dimension",
  );
  assert(
    Array.isArray(edits.search.searchQueries) &&
      edits.search.searchQueries.length === 2,
    "edits.search.searchQueries length 2",
  );
  assert(edits.search.scoreThreshold === 70, "edits.search.scoreThreshold=70");
  assert(edits.search.dailySendCap === 10, "edits.search.dailySendCap=10");
  assert(
    edits.outreach.outreachTone === "casual",
    "edits.outreach.outreachTone=casual",
  );
  assert(reviewEdits.length === 0, "reviewEdits is empty (no user edits)");

  // ── Unit: user-edit diff ───────────────────────────────────────────────
  console.log("\n--- Unit: user-edit diff ---\n");
  const userEdits = {
    ...edits,
    profile: { ...edits.profile, positioning: "CHANGED" },
    search: { ...edits.search, scoreThreshold: 80 },
  };
  const diff = toJobSearchConfirmEdits(state, userEdits);
  assert(
    diff.reviewEdits.length === 2,
    `2 review edits captured (got ${diff.reviewEdits.length})`,
  );
  assert(
    diff.reviewEdits.some(
      (r) => r.dimensionKey === "positioning" && r.editedValue === "CHANGED",
    ),
    "positioning edit captured with previousConfidence",
  );
  assert(
    diff.reviewEdits.some(
      (r) => r.dimensionKey === "scoreThreshold" && r.editedValue === 80,
    ),
    "scoreThreshold edit captured",
  );

  // ── Integration: adapter output → performConfirm → DB ──────────────────
  console.log("\n--- Integration: adapter → performConfirm → DB ---\n");
  await resetUser(userId);

  const { data: interviewRow, error: insertErr } = await supabase
    .from("onboarding_interviews")
    .insert({
      user_id: userId,
      is_refresh: false,
      template_id: "job_search",
      template_version: "v1",
      status: "review",
      messages: [],
      topics_covered: [],
      ready_for_extraction: true,
      orchestrator_state: state,
      // No extracted_* columns — agentic flow doesn't populate them.
    })
    .select("id")
    .single();

  if (insertErr || !interviewRow) {
    console.error(
      "Failed to seed agentic review interview:",
      insertErr?.message,
    );
    process.exit(1);
  }
  const interviewId = interviewRow.id;

  const { performConfirm } =
    await import("../src/app/(app)/onboard/confirm-logic");
  const confirmResult = await performConfirm(
    supabase,
    userId,
    interviewId,
    edits,
  );

  assert(
    confirmResult.ok,
    `performConfirm succeeded (error: ${confirmResult.error})`,
  );
  if (!confirmResult.ok) {
    console.error("Confirm failed — aborting DB assertions");
    process.exit(1);
  }

  // memory_documents: 4 expected (no interview_insights since no insights).
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

  assert(byKey.has("user_profile"), "user_profile memory_doc written");
  assert(byKey.has("user_positioning"), "user_positioning memory_doc written");
  assert(
    byKey.has("user_dealbreakers"),
    "user_dealbreakers memory_doc written",
  );
  assert(
    byKey.has("feedback_outreach_style"),
    "feedback_outreach_style memory_doc written",
  );
  assert(
    !byKey.has("interview_insights"),
    "interview_insights SKIPPED (orchestrator produces no insights)",
  );

  const profile = byKey.get("user_profile") ?? "";
  assert(
    profile.includes("## Positioning"),
    "user_profile has ## Positioning section",
  );
  assert(
    profile.includes("## Career Highlights"),
    "user_profile has ## Career Highlights section",
  );
  assert(
    profile.includes("Compass at Inkeep"),
    "user_profile includes orchestrator-inferred career highlight text",
  );

  const outreach = byKey.get("feedback_outreach_style") ?? "";
  assert(
    outreach.startsWith("## Outreach Tone"),
    "feedback_outreach_style starts with ## Outreach Tone",
  );
  assert(
    outreach.includes("Casual"),
    "feedback_outreach_style includes Casual tone label",
  );

  // pipeline_config
  const { data: cfg } = await supabase
    .from("pipeline_config")
    .select("score_threshold, daily_send_cap, search_queries, search_locations")
    .eq("user_id", userId)
    .maybeSingle();
  assert(!!cfg, "pipeline_config row created");
  if (cfg) {
    assert(cfg.score_threshold === 70, "pipeline_config.score_threshold=70");
    assert(cfg.daily_send_cap === 10, "pipeline_config.daily_send_cap=10");
    assert(
      JSON.stringify(cfg.search_queries) ===
        JSON.stringify(["GTM Engineer", "Growth Engineer"]),
      "pipeline_config.search_queries matches",
    );
    assert(
      JSON.stringify(cfg.search_locations) ===
        JSON.stringify(["San Francisco", "Remote"]),
      "pipeline_config.search_locations matches",
    );
  }

  // user_scoring_profiles
  const { data: sp } = await supabase
    .from("user_scoring_profiles")
    .select("target_roles, preferred_stages")
    .eq("user_id", userId)
    .maybeSingle();
  assert(!!sp, "user_scoring_profiles row created");
  if (sp) {
    assert(
      Array.isArray(sp.target_roles) && sp.target_roles.length > 0,
      "user_scoring_profiles.target_roles non-empty",
    );
  }

  // onboarding_interviews.status
  const { data: finalInterview } = await supabase
    .from("onboarding_interviews")
    .select("status")
    .eq("id", interviewId)
    .single();
  assert(
    finalInterview?.status === "confirmed",
    "onboarding_interviews.status='confirmed'",
  );

  console.log(
    `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
