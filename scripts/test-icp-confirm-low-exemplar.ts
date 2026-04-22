/**
 * SPEC-3 Phase 3.c.5: ICP exemplar-scarcity clamp regression.
 *
 * Two-part test:
 *
 * 1. Unit-style on countPositiveExemplars — given mixed-kind /
 *    mixed-status artifact rows, assert the count picks only succeeded
 *    positives.
 *
 * 2. Integration on performConfirm with 1 positive_example artifact +
 *    a seeded review state. Asserts confirm STILL succeeds (the clamp
 *    is a confidence dampening rule, not a confirm blocker) and that
 *    the resulting icp_rubric still lands. The deterministic clamp
 *    inside run.ts:applyIcpExemplarScarcityClamp fires during analyze
 *    (which we don't exercise here without hitting Opus), but this
 *    test pins the contract that low-exemplar confirms don't break
 *    the pipeline.
 *
 * Usage: npx tsx scripts/test-icp-confirm-low-exemplar.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { countPositiveExemplars } from "../src/lib/onboarding/orchestrator/run";
import { toIcpConfirmEdits } from "../src/lib/onboarding/orchestrator/to-confirm-edits";
import type { OrchestratorState } from "../src/lib/onboarding/orchestrator/types";
import type { OnboardingArtifactRow } from "../src/lib/supabase/types";
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

// ── Part 1: countPositiveExemplars unit test ──────────────────────────────

function makeArtifact(
  kind: string,
  status: OnboardingArtifactRow["status"],
): OnboardingArtifactRow {
  return {
    id: `art-${Math.random()}`,
    user_id: "u",
    interview_id: "i",
    kind,
    source_type: "url",
    source_label: null,
    source_url: null,
    file_name: null,
    mime_type: null,
    status,
    normalized_markdown: null,
    error_message: null,
    created_from_template_id: "icp_definition",
    metadata: {},
    created_at: "",
    updated_at: "",
  };
}

// ── Unit: toIcpConfirmEdits shape coercion ────────────────────────────────

function makeDim(value: unknown) {
  return {
    value,
    summary: "",
    confidence: 0.8,
    threshold: 0.75,
    status: "inferred" as const,
    provenance: [],
    updatedAt: "2026-04-21T00:00:00Z",
  };
}

function makeState(
  dimensions: Record<string, ReturnType<typeof makeDim>>,
): OrchestratorState {
  return {
    version: 1,
    templateId: "icp_definition",
    status: "ready_for_review",
    artifacts: [],
    dimensions,
    activeDimensionKey: null,
    nextDimensionKey: null,
    askedDimensionKeys: [],
    metrics: {
      questionCount: 0,
      artifactSuccessCount: 0,
      artifactFailureCount: 0,
      reviewEdits: [],
    },
  };
}

function unitTestAdapterShapeCoercion() {
  console.log("\n--- Unit: toIcpConfirmEdits shape coercion ---\n");

  // Happy path: orchestrator emits well-shaped firmographics.
  const goodState = makeState({
    firmographics: makeDim({
      industries: ["devtools"],
      employee_range_min: 20,
      employee_range_max: 100,
      stages: ["series-a"],
      geographies: ["US"],
    }),
  });
  const good = toIcpConfirmEdits(goodState);
  assert(
    good.edits.icp.firmographics.employee_range_min === 20,
    "well-shaped firmographics: employee_range_min parsed",
  );
  assert(
    good.edits.icp.firmographics.employee_range_max === 100,
    "well-shaped firmographics: employee_range_max parsed",
  );

  // Malformed path: the model emits a tuple instead of min/max scalars.
  // safeParse should fail + fall back to defaults (0, 10000), NOT silently
  // produce NaN/undefined or inherit from the tuple in bad ways.
  const tupleState = makeState({
    firmographics: makeDim({
      industries: ["devtools"],
      employee_range: [20, 100], // WRONG shape — tuple under a single key
      stages: ["series-a"],
      geographies: ["US"],
    }),
  });
  const tupleResult = toIcpConfirmEdits(tupleState);
  assert(
    tupleResult.edits.icp.firmographics.employee_range_min === 0,
    "malformed tuple firmographics: falls back to employee_range_min=0",
  );
  assert(
    tupleResult.edits.icp.firmographics.employee_range_max === 10000,
    "malformed tuple firmographics: falls back to employee_range_max=10000",
  );

  // Partial shape: orchestrator emits product with only `category`. zod
  // defaults fill the missing leaves.
  const partialState = makeState({
    product: makeDim({ category: "AI SDR agent" }),
  });
  const partialResult = toIcpConfirmEdits(partialState);
  assert(
    partialResult.edits.product.category === "AI SDR agent",
    "partial product: keeps category",
  );
  assert(
    partialResult.edits.product.core_jtbd === "",
    "partial product: core_jtbd defaults to empty string",
  );
  assert(
    partialResult.edits.product.wedge === "",
    "partial product: wedge defaults to empty string",
  );

  // Array-for-object: orchestrator emits an array where an object is
  // required. safeParse fails → fallback defaults.
  const arrayState = makeState({
    buyer: makeDim(["VP Sales", "SDR Lead"]),
  });
  const arrayResult = toIcpConfirmEdits(arrayState);
  assert(
    arrayResult.edits.icp.buyer.economic_buyer === "",
    "array-for-buyer-object: falls back to empty economic_buyer",
  );
}

function unitTestCount() {
  console.log("\n--- Unit: countPositiveExemplars ---\n");
  const artifacts: OnboardingArtifactRow[] = [
    makeArtifact("positive_example", "succeeded"),
    makeArtifact("positive_example", "succeeded"),
    makeArtifact("positive_example", "failed"), // wrong status
    makeArtifact("negative_example", "succeeded"), // wrong kind
    makeArtifact("buyer_persona", "succeeded"), // wrong kind
    makeArtifact("company_context", "succeeded"), // wrong kind
  ];
  assert(
    countPositiveExemplars(artifacts) === 2,
    "counts only succeeded positive_example rows",
  );
  assert(countPositiveExemplars([]) === 0, "empty array returns 0");
  assert(
    countPositiveExemplars([makeArtifact("positive_example", "succeeded")]) ===
      1,
    "single positive returns 1",
  );
}

// ── Part 2: confirm with 1 positive exemplar still succeeds ───────────────

const ICP_EDITS_FIXTURE: IcpEdits = {
  product: {
    category: "AI SDR agent",
    core_jtbd: "Replace manual prospecting",
    wedge: "Series A devtools",
  },
  icp: {
    buyer: {
      economic_buyer: "VP Sales",
      champion: "SDR Lead",
      end_user: "SDR",
    },
    firmographics: {
      industries: ["devtools"],
      employee_range_min: 20,
      employee_range_max: 100,
      stages: ["series-a"],
      geographies: ["US"],
    },
    technographics: {
      required_tools: ["Salesforce"],
      excluded_tools: [],
    },
    signals: {
      hiring_roles: ["SDR"],
      jtbd_evidence: [],
      trigger_events: [],
    },
    disqualifiers: ["Enterprise-only"],
  },
  proof_points: {
    existing_customers: ["The One Customer"],
    won_deals: [],
    lost_deals_reasons: [],
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
  // Clear user_type so the Phase 3.c.6 persona preflight doesn't block the
  // ICP confirm. This test covers the first-confirm happy path under
  // exemplar scarcity; the preflight itself is covered by test:icp-confirm.
  await supabase
    .from("profiles")
    .update({ user_type: null })
    .eq("user_id", userId);
}

async function integrationTestLowExemplar(userId: string) {
  console.log("\n--- Integration: confirm with 1 positive exemplar ---\n");
  await resetUser(userId);

  const { data: interview } = await supabase
    .from("onboarding_interviews")
    .insert({
      user_id: userId,
      is_refresh: false,
      template_id: "icp_definition",
      template_version: "v1",
      status: "review",
      messages: [],
      topics_covered: ["product", "buyer", "proof_points"],
      ready_for_extraction: true,
      extracted: ICP_EDITS_FIXTURE,
    })
    .select("id")
    .single();
  if (!interview) throw new Error("Failed to seed interview");
  const interviewId = interview.id;

  await supabase.from("onboarding_artifacts").insert({
    user_id: userId,
    interview_id: interviewId,
    kind: "positive_example",
    source_type: "url",
    source_url: "https://example.com/the-one-customer",
    source_label: "The One Customer",
    status: "succeeded",
    normalized_markdown: "Series A devtools, 50 employees",
    created_from_template_id: "icp_definition",
  });

  // Verify the count helper sees the seeded row.
  const { data: artifactRows } = await supabase
    .from("onboarding_artifacts")
    .select("*")
    .eq("interview_id", interviewId);
  const count = countPositiveExemplars(
    (artifactRows ?? []) as OnboardingArtifactRow[],
  );
  assert(count === 1, `seeded artifact yields count=1 (got ${count})`);

  const { performConfirm } =
    await import("../src/app/(app)/onboard/confirm-logic");
  const result = await performConfirm(
    supabase,
    userId,
    interviewId,
    ICP_EDITS_FIXTURE,
  );
  assert(
    result.ok,
    `low-exemplar confirm succeeds (clamp is dampening, not blocking) — error: ${result.error}`,
  );

  const { data: sp } = await supabase
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", userId)
    .maybeSingle();
  assert(
    !!sp?.icp_rubric,
    "icp_rubric still populated even with one positive exemplar",
  );

  // Restore.
  await supabase
    .from("profiles")
    .update({ user_type: "job_seeker" })
    .eq("user_id", userId);
  await resetUser(userId);
}

async function main() {
  unitTestAdapterShapeCoercion();
  unitTestCount();

  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));
  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }
  console.log(`Testing with user ${userId}`);

  await integrationTestLowExemplar(userId);

  console.log(
    `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
