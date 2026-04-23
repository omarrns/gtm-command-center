/**
 * SPEC-3 Phase 3.c.5: ICP confirm-path regression test.
 *
 * Seeds a review-state icp_definition interview with 3+ positive_example
 * artifacts and an extracted IcpEdits payload, runs performConfirm, then
 * asserts the full set of confirm-time outputs:
 *   - 3 ICP memory docs (company_icp, icp_proof_points, icp_disqualifiers)
 *   - pipeline_config row
 *   - user_scoring_profiles.icp_rubric populated with the structured shape
 *   - profiles.user_type='gtm'
 *   - onboarding_interviews.status='confirmed'
 *
 * Then re-runs confirm to verify idempotency (no duplicate memory docs,
 * user_type still 'gtm').
 *
 * Restores profiles.user_type to 'job_seeker' at the end so the test
 * user's state is consistent with the rest of the test suite.
 *
 * Usage: npx tsx scripts/test-icp-confirm.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { IcpEdits } from "../src/lib/onboarding/icp-schemas";

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
  if (condition) console.log(`  PASS: ${label}`);
  else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

const ICP_EDITS_FIXTURE: IcpEdits = {
  product: {
    category: "AI SDR agent",
    core_jtbd: "Replace manual account research and outbound prospecting",
    wedge: "Outbound-heavy GTM teams at Series A-B devtools",
  },
  icp: {
    buyer: {
      economic_buyer: "VP Sales / Head of Revenue",
      champion: "SDR Team Lead",
      end_user: "Individual SDR / BDR",
    },
    firmographics: {
      industries: ["devtools", "ai-ml"],
      employee_range_min: 20,
      employee_range_max: 200,
      stages: ["series-a", "series-b"],
      geographies: ["US", "Canada", "UK"],
    },
    technographics: {
      required_tools: ["Salesforce", "Outreach"],
      excluded_tools: ["Zoho", "Freshsales"],
    },
    signals: {
      hiring_roles: ["SDR", "BDR", "Sales Development Representative"],
      jtbd_evidence: [
        "Manual prospecting workflows in Notion",
        "Low meeting-per-SDR ratios",
      ],
      trigger_events: ["Series B raise", "New VP Sales hire"],
    },
    disqualifiers: ["Enterprise-only sales motion", "No outbound currently"],
  },
  proof_points: {
    existing_customers: ["Acme Devtools", "Beta AI", "Gamma Cloud"],
    won_deals: ["Acme — replaced internal SDR tooling"],
    lost_deals_reasons: ["Too enterprise (60-day procurement)"],
  },
};

async function resetUser(userId: string) {
  await supabase
    .from("memory_documents")
    .delete()
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  await supabase.from("pipeline_config").delete().eq("user_id", userId);
  await supabase.from("user_scoring_profiles").delete().eq("user_id", userId);
  await supabase
    .from("onboarding_interviews")
    .delete()
    .eq("user_id", userId)
    .eq("template_id", "icp_definition");
  await supabase
    .from("onboarding_artifacts")
    .delete()
    .eq("user_id", userId)
    .eq("created_from_template_id", "icp_definition");
  // Clear user_type so the Phase 3.c.4 guard doesn't block the gtm write —
  // we're testing the first-confirm path, which assumes a fresh persona.
  await supabase
    .from("profiles")
    .update({ user_type: null })
    .eq("user_id", userId);
}

async function seedReviewInterview(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("onboarding_interviews")
    .insert({
      user_id: userId,
      is_refresh: false,
      template_id: "icp_definition",
      template_version: "v1",
      status: "review",
      messages: [],
      topics_covered: [
        "product",
        "buyer",
        "firmographics",
        "technographics",
        "signals",
        "disqualifiers",
        "proof_points",
      ],
      ready_for_extraction: true,
      // ICP writes the unified `extracted` slot; the four legacy columns
      // stay NULL because the dispatch in interview-actions.ts skips them
      // for non-job_search templates.
      extracted: ICP_EDITS_FIXTURE,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to seed ICP review interview: ${error?.message}`);
  }
  return data.id;
}

async function seedPositiveExemplars(
  userId: string,
  interviewId: string,
  count: number,
) {
  const rows = Array.from({ length: count }).map((_, i) => ({
    user_id: userId,
    interview_id: interviewId,
    kind: "positive_example",
    source_type: "url",
    source_url: `https://example.com/customer-${i + 1}`,
    source_label: `Customer ${i + 1}`,
    status: "succeeded",
    normalized_markdown: `Customer ${i + 1} — Series A devtools, 50 employees`,
    created_from_template_id: "icp_definition",
  }));
  await supabase.from("onboarding_artifacts").insert(rows);
}

async function assertIcpConfirmedState(userId: string, interviewId: string) {
  // Memory docs
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

  assert(byKey.has("company_icp"), "memory_documents[company_icp] exists");
  assert(
    byKey.has("icp_proof_points"),
    "memory_documents[icp_proof_points] exists",
  );
  assert(
    byKey.has("icp_disqualifiers"),
    "memory_documents[icp_disqualifiers] exists",
  );

  const icp = byKey.get("company_icp") ?? "";
  assert(icp.includes("AI SDR agent"), "company_icp renders product.category");
  assert(
    icp.includes("Series A-B devtools") || icp.includes("Series A-B"),
    "company_icp renders product.wedge",
  );
  assert(icp.includes("VP Sales"), "company_icp renders buyer.economic_buyer");
  assert(icp.includes("devtools"), "company_icp renders firmographics");
  assert(icp.includes("Salesforce"), "company_icp renders required_tools");

  const proofs = byKey.get("icp_proof_points") ?? "";
  assert(
    proofs.includes("Acme Devtools"),
    "icp_proof_points renders existing customers",
  );

  const disq = byKey.get("icp_disqualifiers") ?? "";
  assert(
    disq.includes("Enterprise-only sales motion"),
    "icp_disqualifiers renders disqualifier strings",
  );

  // pipeline_config
  const { data: cfg } = await supabase
    .from("pipeline_config")
    .select("score_threshold, daily_send_cap, search_queries")
    .eq("user_id", userId)
    .maybeSingle();
  assert(!!cfg, "pipeline_config row exists");
  assert(
    Array.isArray(cfg?.search_queries) && cfg.search_queries.length === 0,
    "pipeline_config.search_queries is empty (Exa discovery deferred)",
  );

  // user_scoring_profiles.icp_rubric
  const { data: sp } = await supabase
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", userId)
    .maybeSingle();
  assert(!!sp?.icp_rubric, "user_scoring_profiles.icp_rubric populated");
  if (sp?.icp_rubric) {
    const rubric = sp.icp_rubric as Record<string, unknown>;
    assert(
      typeof rubric.product === "object" && rubric.product !== null,
      "icp_rubric.product object present",
    );
    assert(
      typeof rubric.firmographics === "object",
      "icp_rubric.firmographics present",
    );
    assert(
      Array.isArray(rubric.disqualifiers),
      "icp_rubric.disqualifiers is an array",
    );
    assert(
      typeof rubric.proof_points === "object",
      "icp_rubric.proof_points present",
    );
  }

  // profiles.user_type
  const { data: profile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("user_id", userId)
    .single();
  assert(profile?.user_type === "gtm", "profiles.user_type='gtm'");

  // interview status
  const { data: interview } = await supabase
    .from("onboarding_interviews")
    .select("status, template_id")
    .eq("id", interviewId)
    .single();
  assert(
    interview?.status === "confirmed",
    "onboarding_interviews.status='confirmed'",
  );
  assert(
    interview?.template_id === "icp_definition",
    "onboarding_interviews.template_id unchanged",
  );
}

async function assertNoDuplicates(userId: string) {
  const { count: memCount } = await supabase
    .from("memory_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  assert(
    memCount === 3,
    `memory_documents count is exactly 3 (got ${memCount})`,
  );

  const { count: cfgCount } = await supabase
    .from("pipeline_config")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assert(
    cfgCount === 1,
    `pipeline_config count is exactly 1 (got ${cfgCount})`,
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

async function restoreJobSeekerState(userId: string) {
  // Test-suite hygiene: leave the user as job_seeker so other tests don't
  // see an unexpected 'gtm' value.
  await supabase
    .from("profiles")
    .update({ user_type: "job_seeker" })
    .eq("user_id", userId);
  await resetUser(userId);
}

async function main() {
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));
  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }

  console.log(`Testing with user ${userId}`);
  console.log("Resetting ICP state...");
  await resetUser(userId);

  console.log("Seeding review-state ICP interview...");
  const interviewId = await seedReviewInterview(userId);
  console.log(`Interview id: ${interviewId}`);

  console.log("Seeding 3 positive_example artifacts...");
  await seedPositiveExemplars(userId, interviewId, 3);

  console.log("Loading performConfirm...");
  const { performConfirm } =
    await import("../src/app/(app)/onboard/confirm-logic");

  console.log("\n--- First confirm run ---\n");
  const first = await performConfirm(
    supabase,
    userId,
    interviewId,
    ICP_EDITS_FIXTURE,
  );
  assert(first.ok, `first performConfirm returns ok (error: ${first.error})`);
  if (!first.ok) {
    console.error("First confirm failed — aborting");
    await restoreJobSeekerState(userId);
    process.exit(1);
  }

  console.log("\n--- Asserting DB state ---\n");
  await assertIcpConfirmedState(userId, interviewId);

  console.log(
    "\n--- Reverting interview to review for idempotency check ---\n",
  );
  await supabase
    .from("onboarding_interviews")
    .update({ status: "review" })
    .eq("id", interviewId);

  const second = await performConfirm(
    supabase,
    userId,
    interviewId,
    ICP_EDITS_FIXTURE,
  );
  assert(
    second.ok,
    `second performConfirm returns ok (error: ${second.error})`,
  );

  console.log("\n--- Asserting no duplicates ---\n");
  await assertNoDuplicates(userId);

  console.log("\n--- Re-asserting full state after second confirm ---\n");
  await assertIcpConfirmedState(userId, interviewId);

  console.log("\n--- Restoring job_seeker state ---\n");
  await restoreJobSeekerState(userId);

  // ── Persona preflight regression (Phase 3.c.6) ─────────────────────────
  // A confirmed job_seeker must not be able to deep-confirm an ICP
  // interview. The preflight in performConfirm returns an error before
  // any output writes. Asserts the error is surfaced AND no ICP outputs
  // leak into the DB.
  console.log("\n--- Preflight: job_seeker can't confirm ICP ---\n");
  await resetUser(userId);
  // Stamp user as job_seeker (the state after a real job_search confirm).
  await supabase
    .from("profiles")
    .update({ user_type: "job_seeker" })
    .eq("user_id", userId);

  const mismatchInterviewId = await seedReviewInterview(userId);

  const blocked = await performConfirm(
    supabase,
    userId,
    mismatchInterviewId,
    ICP_EDITS_FIXTURE,
  );
  assert(!blocked.ok, "preflight blocks the mismatched confirm");
  assert(
    !!blocked.error && blocked.error.includes("mix personas"),
    `error mentions persona mismatch (got: ${blocked.error})`,
  );

  // Assert no writes happened: no ICP memory docs, no pipeline_config, no
  // icp_rubric, status stays 'review', user_type stays 'job_seeker'.
  const { count: leakedMemDocs } = await supabase
    .from("memory_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("document_key", [
      "company_icp",
      "icp_proof_points",
      "icp_disqualifiers",
    ]);
  assert(
    leakedMemDocs === 0,
    `no ICP memory docs written on blocked confirm (got ${leakedMemDocs})`,
  );

  const { count: leakedConfig } = await supabase
    .from("pipeline_config")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assert(
    leakedConfig === 0,
    `no pipeline_config written on blocked confirm (got ${leakedConfig})`,
  );

  const { data: leakedRubric } = await supabase
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", userId)
    .maybeSingle();
  assert(!leakedRubric?.icp_rubric, "no icp_rubric written on blocked confirm");

  const { data: mismatchInterview } = await supabase
    .from("onboarding_interviews")
    .select("status")
    .eq("id", mismatchInterviewId)
    .single();
  assert(
    mismatchInterview?.status === "review",
    `interview stays in 'review' (got ${mismatchInterview?.status})`,
  );

  const { data: mismatchProfile } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("user_id", userId)
    .single();
  assert(
    mismatchProfile?.user_type === "job_seeker",
    `user_type remains 'job_seeker' (got ${mismatchProfile?.user_type})`,
  );

  await restoreJobSeekerState(userId);

  console.log(
    `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
