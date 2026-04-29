/**
 * ICP interview TDD contract — see .claude/plans/icp-interview-tdd.md.
 *
 * Pins the deterministic behavior of the ICP interview flow. Unit tests
 * (no DB, no Opus) run first; DB integration tests run after.
 *
 * Contracts:
 *   C1 — User edits land in BOTH memory docs AND icp_rubric
 *   C2 — Exemplar scarcity clamp (pure)
 *   C3 — nextDimensionToAsk / 2-ask cap (pure)
 *   C4 — toIcpConfirmEdits shape coercion (pure)
 *   C5 — detectIcpDisagreements heuristic (pure)
 *   C6 — persona preflight (integration)
 *   C7 — idempotency (integration)
 *
 * Usage: npm run test:icp-interview
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  applyIcpExemplarScarcityClamp,
  nextDimensionToAsk,
} from "../src/lib/onboarding/orchestrator/run";
import { toIcpConfirmEdits } from "../src/lib/onboarding/orchestrator/to-confirm-edits";
import { detectIcpDisagreements } from "../src/lib/onboarding/orchestrator/icp-disagreements";
import { ICP_DEFINITION_TEMPLATE } from "../src/lib/onboarding/templates/icp-definition";
import { getTemplate } from "../src/lib/onboarding/templates";
import {
  emptyOrchestratorState,
  type OrchestratorState,
  type OrchestratorDimension,
} from "../src/lib/onboarding/orchestrator/types";
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

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  PASS: ${label}`);
  else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

// ── Fixture helpers ────────────────────────────────────────────────────────

function makeDim(
  value: unknown,
  confidence = 0.8,
  threshold = 0.75,
  status: OrchestratorDimension["status"] = "inferred",
): OrchestratorDimension {
  return {
    value,
    summary: "",
    confidence,
    threshold,
    status,
    provenance: [],
    updatedAt: "2026-04-22T00:00:00Z",
  };
}

function completeValueForDimension(key: string): unknown {
  switch (key) {
    case "product":
      return {
        category: "AI SDR",
        core_jtbd: "Automate account research",
        wedge: "Outbound teams",
        delivery_model: "saas",
      };
    case "buyer":
      return {
        economic_buyer: "VP Sales",
        champion: "RevOps",
        end_user: "SDR",
        deal_blocker: "CFO",
      };
    case "firmographics":
      return {
        industries: ["devtools"],
        business_model: "saas",
        employee_range: { min: 20, max: 200 },
        stages: ["series_a"],
        geographies: ["US"],
      };
    case "technographics":
      return {
        required_tools: ["Salesforce"],
        excluded_tools: ["Zoho"],
        tech_maturity: "cloud_native",
        data_infrastructure: "warehouse",
      };
    case "signals":
      return {
        hiring_roles: ["SDR"],
        jtbd_evidence: ["manual research"],
        trigger_events: ["new VP Sales"],
        pain_language: ["low pipeline coverage"],
      };
    case "disqualifiers":
      return {
        tech_disqualifiers: ["Zoho"],
        size_disqualifiers: "Under 10 employees",
        stage_disqualifiers: ["public"],
        behavioral_disqualifiers: ["no outbound"],
      };
    default:
      return "x";
  }
}

function makeCompleteDim(
  key: string,
  threshold: number,
): OrchestratorDimension {
  return {
    ...makeDim(completeValueForDimension(key), 1, threshold, "inferred"),
    evidenceCoverage: 1,
    missingFields: [],
    weakFields: [],
  };
}

function makeState(
  dimensions: Record<string, OrchestratorDimension>,
): OrchestratorState {
  return {
    ...emptyOrchestratorState("icp_definition"),
    status: "ready_for_review",
    dimensions,
  };
}

function makeArtifact(
  kind: string,
  status: OnboardingArtifactRow["status"],
  id = `art-${Math.random()}`,
): OnboardingArtifactRow {
  return {
    id,
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

// ── C2: Exemplar scarcity weak evidence ────────────────────────────────────

function unitTestScarcityClamp() {
  console.log("\n--- C2: applyIcpExemplarScarcityClamp ---\n");
  if (!ICP_DEFINITION_TEMPLATE.agenticMode) {
    throw new Error("expected agentic template");
  }
  const dims = ICP_DEFINITION_TEMPLATE.dimensions;
  const positives = (n: number) =>
    Array.from({ length: n }).map((_, i) =>
      makeArtifact("positive_example", "succeeded", `p-${i}`),
    );

  // Count gating on firmographics (representative exemplar-derived dim)
  {
    const s = makeState({
      firmographics: makeCompleteDim("firmographics", 0.75),
    });
    applyIcpExemplarScarcityClamp(s, positives(0), dims);
    assert(
      s.dimensions.firmographics.confidence === 1,
      "count=0: firmo completeness stays (declarative mode)",
    );
  }
  {
    const s = makeState({
      firmographics: makeCompleteDim("firmographics", 0.75),
    });
    applyIcpExemplarScarcityClamp(s, positives(1), dims);
    assert(
      s.dimensions.firmographics.confidence === 1,
      "count=1: firmo completeness stays 1",
    );
    assert(
      s.dimensions.firmographics.evidenceCoverage === 0,
      "count=1: firmo evidence coverage drops to 0",
    );
    assert(
      s.dimensions.firmographics.weakFields?.includes("industries") === true,
      "count=1: populated firmo fields become weak evidence",
    );
    assert(
      s.dimensions.firmographics.summary.includes("only 1 positive exemplar"),
      "count=1: summary suffix mentions evidence scarcity",
    );
  }
  {
    const s = makeState({
      firmographics: makeCompleteDim("firmographics", 0.75),
    });
    applyIcpExemplarScarcityClamp(s, positives(2), dims);
    assert(
      s.dimensions.firmographics.confidence === 1,
      "count=2: firmo completeness stays 1",
    );
    assert(
      s.dimensions.firmographics.summary.includes("only 2 positive exemplars"),
      "count=2: summary suffix mentions 'only 2 positive exemplars'",
    );
  }
  {
    const s = makeState({
      firmographics: makeCompleteDim("firmographics", 0.75),
    });
    applyIcpExemplarScarcityClamp(s, positives(3), dims);
    assert(
      s.dimensions.firmographics.evidenceCoverage === 1,
      "count=3: firmo evidence stays covered (pattern threshold reached)",
    );
  }

  // Empty/default values have no populated fields to weaken.
  {
    const s = makeState({ firmographics: makeDim("x", 0, 0.75) });
    applyIcpExemplarScarcityClamp(s, positives(1), dims);
    assert(
      s.dimensions.firmographics.weakFields === undefined,
      "count=1: default firmo has no weak fields",
    );
  }
  {
    const s = makeState({
      firmographics: makeCompleteDim("firmographics", 0.75),
    });
    applyIcpExemplarScarcityClamp(s, positives(1), dims);
    applyIcpExemplarScarcityClamp(s, positives(1), dims);
    assert(
      s.dimensions.firmographics.summary.indexOf("evidence remains weak") ===
        s.dimensions.firmographics.summary.lastIndexOf("evidence remains weak"),
      "count=1: scarcity suffix is idempotent",
    );
  }

  // Allow-list: product / buyer NEVER clamped
  {
    const s = makeState({
      product: makeDim("x", 0.8, 0.75),
      buyer: makeDim("x", 0.8, 0.75),
    });
    applyIcpExemplarScarcityClamp(s, positives(1), dims);
    assert(
      s.dimensions.product.confidence === 0.8,
      "count=1: product 0.8 stays (not exemplar-derived)",
    );
    assert(
      s.dimensions.buyer.confidence === 0.8,
      "count=1: buyer 0.8 stays (not exemplar-derived)",
    );
  }

  // Weak evidence, not confidence, now drives the follow-up route.
  {
    const s = makeState({ signals: makeCompleteDim("signals", 0.5) });
    applyIcpExemplarScarcityClamp(s, positives(1), dims);
    assert(
      s.dimensions.signals.confidence === 1,
      "count=1: signals completeness stays 1",
    );
    assert(
      (s.dimensions.signals.weakFields ?? []).length > 0,
      "count=1: signals weak evidence drives follow-up",
    );
  }

  // All core exemplar-derived dims clamped in one pass. Proof points are
  // evidence/calibration now, not a core dimension, so they are ignored.
  {
    const s = makeState({
      firmographics: makeCompleteDim("firmographics", 0.75),
      technographics: makeCompleteDim("technographics", 0.7),
      signals: makeCompleteDim("signals", 0.7),
      proof_points: makeDim("x", 0.88, 0.75),
    });
    applyIcpExemplarScarcityClamp(s, positives(1), dims);
    assert(
      (s.dimensions.firmographics.weakFields ?? []).length > 0,
      "multi: firmographics marked weak",
    );
    assert(
      (s.dimensions.technographics.weakFields ?? []).length > 0,
      "multi: technographics marked weak",
    );
    assert(
      (s.dimensions.signals.weakFields ?? []).length > 0,
      "multi: signals marked weak",
    );
    assert(
      s.dimensions.proof_points.confidence === 0.88,
      "multi: proof_points not touched",
    );
  }
}

// ── C3: nextDimensionToAsk ─────────────────────────────────────────────────

function unitTestNextDimensionToAsk() {
  console.log("\n--- C3: nextDimensionToAsk ---\n");
  // Use getTemplate here (not ICP_DEFINITION_TEMPLATE directly) so the
  // template object lands at its generic form. InterviewTemplate<E,X> is
  // invariant on E via OutputMapping.transform, so the concrete-typed
  // export isn't assignable to nextDimensionToAsk's unknown/unknown param.
  const template = getTemplate("icp_definition");
  if (!template.agenticMode) {
    throw new Error("expected agentic template");
  }

  // Empty state → first dim (product is first in ICP template)
  {
    const s = makeState({});
    const next = nextDimensionToAsk(s, template);
    assert(
      next?.key === "product",
      `empty state → 'product' (got ${next?.key})`,
    );
  }

  // Answered status alone does NOT gate re-asking — quality does. An
  // ambiguous user answer that leaves completeness/evidence below threshold
  // should still get picked (until the 2-ask cap). Pinning this so anyone
  // tempted to "short-circuit on status === 'answered'" sees a red test.
  {
    const dims: Record<string, OrchestratorDimension> = {};
    for (const d of template.dimensions) {
      dims[d.key] = makeDim("x", 0.3, d.confidenceThreshold, "answered");
    }
    const s = makeState(dims);
    assert(
      nextDimensionToAsk(s, template)?.key === "product",
      "all answered but low-quality → still picks (status doesn't gate)",
    );
  }

  // 2-ask cap exhausts the queue even for below-threshold dims
  {
    const dims: Record<string, OrchestratorDimension> = {};
    for (const d of template.dimensions) {
      dims[d.key] = makeDim("x", 0.3, d.confidenceThreshold, "answered");
    }
    const s = makeState(dims);
    s.askedDimensionKeys = template.dimensions.flatMap((d) => [d.key, d.key]);
    assert(
      nextDimensionToAsk(s, template) === null,
      "every dim hit 2-ask cap → null (interview done)",
    );
  }

  // All above threshold → null
  {
    const dims: Record<string, OrchestratorDimension> = {};
    for (const d of template.dimensions) {
      dims[d.key] = makeCompleteDim(d.key, d.confidenceThreshold);
    }
    const s = makeState(dims);
    assert(
      nextDimensionToAsk(s, template) === null,
      "all above threshold → null",
    );
  }

  // One below → picks that one
  {
    const dims: Record<string, OrchestratorDimension> = {};
    for (const d of template.dimensions) {
      dims[d.key] = makeCompleteDim(d.key, d.confidenceThreshold);
    }
    const firmoDim = template.dimensions.find((d) => d.key === "firmographics");
    if (!firmoDim) throw new Error("expected firmographics dimension");
    dims.firmographics = makeDim(
      "x",
      0.3,
      firmoDim.confidenceThreshold,
      "needs_question",
    );
    const s = makeState(dims);
    const next = nextDimensionToAsk(s, template);
    assert(
      next?.key === "firmographics",
      `only firmo below → 'firmographics' (got ${next?.key})`,
    );
  }

  // 2-ask cap: after two asks of product, picks next below-threshold dim
  {
    const s = makeState({});
    s.askedDimensionKeys = ["product", "product"];
    const next = nextDimensionToAsk(s, template);
    assert(
      next?.key === "buyer",
      `product capped → 'buyer' next (got ${next?.key})`,
    );
  }

  // Single ask: not yet capped
  {
    const s = makeState({});
    s.askedDimensionKeys = ["product"];
    const next = nextDimensionToAsk(s, template);
    assert(
      next?.key === "product",
      `product asked once → still picks product (got ${next?.key})`,
    );
  }

  // Iteration order: product comes before buyer in template order
  {
    const dims: Record<string, OrchestratorDimension> = {};
    for (const d of template.dimensions) {
      dims[d.key] = makeCompleteDim(d.key, d.confidenceThreshold);
    }
    dims.product = makeDim("x", 0.3, 0.75, "needs_question");
    dims.buyer = makeDim("x", 0.3, 0.75, "needs_question");
    const s = makeState(dims);
    assert(
      nextDimensionToAsk(s, template)?.key === "product",
      "product + buyer both below → picks product first (template order)",
    );
  }
}

// ── C4: toIcpConfirmEdits coercion (augments existing tests) ───────────────

function unitTestAdapterCoercion() {
  console.log("\n--- C4: toIcpConfirmEdits augmented ---\n");

  // Extra keys stripped (zod strict-ish — defaults fill, extras drop)
  {
    const s = makeState({
      product: makeDim({
        category: "X",
        core_jtbd: "Y",
        wedge: "Z",
        __extra: "nope",
      }),
    });
    const r = toIcpConfirmEdits(s);
    assert(r.edits.product.category === "X", "extra keys: category preserved");
    assert(
      !("__extra" in (r.edits.product as unknown as Record<string, unknown>)),
      "extra keys: __extra stripped by schema",
    );
  }

  // Missing section entirely → schema defaults
  {
    const s = makeState({});
    const r = toIcpConfirmEdits(s);
    assert(
      r.edits.icp.firmographics.employee_range.min === 0,
      "missing firmo: min defaults to 0",
    );
    assert(
      r.edits.icp.firmographics.employee_range.max === 10000,
      "missing firmo: max defaults to 10000",
    );
    assert(
      Array.isArray(r.edits.icp.firmographics.industries) &&
        r.edits.icp.firmographics.industries.length === 0,
      "missing firmo: industries empty array",
    );
  }

  // String where array expected → fallback
  {
    const s = makeState({
      signals: makeDim({
        hiring_roles: "not-an-array",
        jtbd_evidence: [],
        trigger_events: [],
      }),
    });
    const r = toIcpConfirmEdits(s);
    assert(
      Array.isArray(r.edits.icp.signals.hiring_roles) &&
        r.edits.icp.signals.hiring_roles.length === 0,
      "bad signals shape: hiring_roles falls back to empty array",
    );
  }

  // finalEdits pass-through + reviewEdits populated
  {
    const s = makeState({
      product: makeDim({ category: "A", core_jtbd: "B", wedge: "C" }),
    });
    const final: IcpEdits = {
      product: {
        category: "USER",
        core_jtbd: "USER",
        wedge: "USER",
        delivery_model: "",
      },
      icp: {
        buyer: {
          economic_buyer: "",
          champion: "",
          end_user: "",
          deal_blocker: "",
        },
        firmographics: {
          industries: [],
          business_model: "",
          employee_range: { min: 0, max: 10000 },
          stages: [],
          geographies: [],
        },
        technographics: {
          required_tools: [],
          excluded_tools: [],
          tech_maturity: "",
          data_infrastructure: "",
        },
        signals: {
          hiring_roles: [],
          jtbd_evidence: [],
          trigger_events: [],
          pain_language: [],
        },
        disqualifiers: {
          tech_disqualifiers: [],
          size_disqualifiers: "",
          stage_disqualifiers: [],
          behavioral_disqualifiers: [],
        },
      },
      proof_points: {
        existing_customers: [],
        won_deals: [],
        lost_deals_reasons: [],
      },
    };
    const r = toIcpConfirmEdits(s, final);
    assert(
      r.edits.product.category === "USER",
      "finalEdits pass-through: user's category wins",
    );
    assert(
      r.reviewEdits.some((e) => e.dimensionKey === "product"),
      "finalEdits pass-through: product flagged as edited in reviewEdits",
    );
  }

  // Evidence-wrapped sub-dimension values unwrap before coercion.
  {
    const s = makeState({
      product: makeDim({
        category: {
          value: "AI SDR",
          evidence: { strength: "weak_or_unknown" },
        },
        core_jtbd: { value: "Find accounts", evidence: {} },
        wedge: "Devtools GTM",
      }),
    });
    const r = toIcpConfirmEdits(s);
    assert(
      r.edits.product.category === "AI SDR" &&
        r.edits.product.core_jtbd === "Find accounts",
      "evidence-wrapped product fields unwrap into confirm edits",
    );
  }

  // Structured disqualifiers stay structured through review edits.
  {
    const s = makeState({
      disqualifiers: makeDim({
        tech_disqualifiers: ["Zoho"],
        size_disqualifiers: "Under 10 employees",
        stage_disqualifiers: ["Public"],
        behavioral_disqualifiers: ["No outbound"],
      }),
    });
    const r = toIcpConfirmEdits(s);
    assert(
      r.edits.icp.disqualifiers.tech_disqualifiers.includes("Zoho") &&
        r.edits.icp.disqualifiers.size_disqualifiers === "Under 10 employees" &&
        r.edits.icp.disqualifiers.stage_disqualifiers.includes("Public") &&
        r.edits.icp.disqualifiers.behavioral_disqualifiers.includes(
          "No outbound",
        ),
      "structured disqualifiers stay structured for review edits",
    );
  }

  // Without finalEdits → reviewEdits empty
  {
    const s = makeState({
      product: makeDim({ category: "A", core_jtbd: "B", wedge: "C" }),
    });
    const r = toIcpConfirmEdits(s);
    assert(r.reviewEdits.length === 0, "no finalEdits: reviewEdits empty");
  }
}

// ── C5: detectIcpDisagreements ─────────────────────────────────────────────

function unitTestDisagreements() {
  console.log("\n--- C5: detectIcpDisagreements ---\n");

  assert(
    detectIcpDisagreements(null).length === 0,
    "null state → no disagreements",
  );

  {
    const s = makeState({});
    assert(
      detectIcpDisagreements(s).length === 0,
      "empty manifest → no disagreements",
    );
  }

  type Art = { id: string; kind: string; sourceLabel: string };
  function stateWith(
    dimKey: string,
    summary: string,
    provArtifactIds: string[],
    artifacts: Art[],
  ): OrchestratorState {
    const prov = provArtifactIds.map((artifactId) => {
      const a = artifacts.find((x) => x.id === artifactId);
      if (!a) throw new Error(`missing artifact ${artifactId}`);
      return { artifactId, sourceLabel: a.sourceLabel };
    });
    const s = makeState({
      [dimKey]: {
        ...makeDim("x", 0.8, 0.75, "inferred"),
        summary,
        provenance: prov,
      },
    });
    s.artifacts = artifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      sourceType: "url" as const,
      sourceLabel: a.sourceLabel,
      status: "succeeded" as const,
    }));
    return s;
  }

  const company = { id: "c1", kind: "company_context", sourceLabel: "Deck" };
  const positive = { id: "p1", kind: "positive_example", sourceLabel: "Acme" };
  const buyer = { id: "b1", kind: "buyer_persona", sourceLabel: "VP Sales" };
  const negative = {
    id: "n1",
    kind: "negative_example",
    sourceLabel: "BadFit",
  };

  // Only declared provenance → not flagged even with keyword
  {
    const s = stateWith(
      "firmographics",
      "exemplars contradict declared",
      ["c1", "b1"],
      [company, buyer],
    );
    assert(
      detectIcpDisagreements(s).length === 0,
      "only declared sources → not flagged even with 'contradict'",
    );
  }

  // Only inferred provenance → not flagged even with keyword
  {
    const s = stateWith(
      "firmographics",
      "exemplars contradict declared",
      ["p1", "n1"],
      [positive, negative],
    );
    assert(
      detectIcpDisagreements(s).length === 0,
      "only inferred sources → not flagged even with 'contradict'",
    );
  }

  // Mixed + high keyword → flagged high
  {
    const s = stateWith(
      "firmographics",
      "exemplars contradict declared ICP",
      ["c1", "p1"],
      [company, positive],
    );
    const d = detectIcpDisagreements(s);
    assert(d.length === 1, "mixed + high keyword → 1 disagreement");
    assert(
      d[0]?.severity === "high",
      `severity 'high' (got ${d[0]?.severity})`,
    );
    assert(
      d[0]?.declaredSources.includes("Deck"),
      "declaredSources includes 'Deck'",
    );
    assert(
      d[0]?.inferredSources.includes("Acme"),
      "inferredSources includes 'Acme'",
    );
  }

  // Mixed + medium keyword → flagged medium
  {
    const s = stateWith(
      "firmographics",
      "exemplars skew A-B, however user declared A-C",
      ["c1", "p1"],
      [company, positive],
    );
    const d = detectIcpDisagreements(s);
    assert(d.length === 1, "mixed + 'however' → 1 disagreement");
    assert(
      d[0]?.severity === "medium",
      `severity 'medium' (got ${d[0]?.severity})`,
    );
  }

  // Mixed but no keyword → NOT flagged (over-call prevention)
  {
    const s = stateWith(
      "firmographics",
      "3 of 4 are devtools",
      ["c1", "p1"],
      [company, positive],
    );
    assert(
      detectIcpDisagreements(s).length === 0,
      "mixed provenance + no keyword → NOT flagged",
    );
  }

  // High keyword wins when both are present
  {
    const s = stateWith(
      "firmographics",
      "however, exemplars contradict declared",
      ["c1", "p1"],
      [company, positive],
    );
    const d = detectIcpDisagreements(s);
    assert(
      d[0]?.severity === "high",
      "high keyword wins over medium when both match",
    );
  }

  // Structured conflict: required tool is also excluded.
  {
    const s = makeState({
      technographics: makeDim({
        required_tools: ["Salesforce"],
        excluded_tools: ["Salesforce"],
      }),
    });
    const d = detectIcpDisagreements(s);
    assert(
      d.some(
        (entry) =>
          entry.dimensionKey === "technographics" &&
          entry.summary.includes("Salesforce"),
      ),
      "required-vs-excluded tool overlap flags structured disagreement",
    );
  }
}

// ── Integration fixtures + helpers ─────────────────────────────────────────

const ICP_FIXTURE_A: IcpEdits = {
  product: {
    category: "AI SDR agent",
    core_jtbd: "Replace manual prospecting",
    wedge: "Series A devtools",
    delivery_model: "",
  },
  icp: {
    buyer: {
      economic_buyer: "VP Sales",
      champion: "SDR Lead",
      end_user: "SDR",
      deal_blocker: "",
    },
    firmographics: {
      industries: ["devtools"],
      business_model: "",
      employee_range: { min: 20, max: 200 },
      stages: ["series-a"],
      geographies: ["US"],
    },
    technographics: {
      required_tools: ["Salesforce"],
      excluded_tools: [],
      tech_maturity: "",
      data_infrastructure: "",
    },
    signals: {
      hiring_roles: ["SDR"],
      jtbd_evidence: [],
      trigger_events: [],
      pain_language: [],
    },
    disqualifiers: {
      tech_disqualifiers: [],
      size_disqualifiers: "",
      stage_disqualifiers: [],
      behavioral_disqualifiers: ["Enterprise-only"],
    },
  },
  proof_points: {
    existing_customers: ["Acme"],
    won_deals: [],
    lost_deals_reasons: [],
  },
};

const ICP_FIXTURE_B: IcpEdits = {
  product: {
    category: "Revenue intelligence platform",
    core_jtbd: "Capture buyer signals end-to-end",
    wedge: "Mid-market vertical SaaS",
    delivery_model: "",
  },
  icp: {
    buyer: {
      economic_buyer: "CRO",
      champion: "RevOps Lead",
      end_user: "AE",
      deal_blocker: "",
    },
    firmographics: {
      industries: ["vertical-saas", "healthtech"],
      business_model: "",
      employee_range: { min: 100, max: 1000 },
      stages: ["series-b", "series-c"],
      geographies: ["US", "Canada"],
    },
    technographics: {
      required_tools: ["Gong", "Salesforce"],
      excluded_tools: ["HubSpot"],
      tech_maturity: "",
      data_infrastructure: "",
    },
    signals: {
      hiring_roles: ["RevOps Manager", "AE"],
      jtbd_evidence: ["Manual forecasting in spreadsheets"],
      trigger_events: ["New CRO hire"],
      pain_language: [],
    },
    disqualifiers: {
      tech_disqualifiers: [],
      size_disqualifiers: "",
      stage_disqualifiers: [],
      behavioral_disqualifiers: ["PLG-only", "< $10M ARR"],
    },
  },
  proof_points: {
    existing_customers: ["Beta Corp", "Gamma Inc"],
    won_deals: ["Beta — replaced Gong"],
    lost_deals_reasons: ["Too enterprise"],
  },
};

// ── C8: URL paste parsing ──────────────────────────────────────────────────
//
// Bug repro: a user pasted six bullet-prefixed URLs ("- https://...")
// expecting six separate URL artifacts; got one text artifact instead.
// Root cause was that parseUrlLikeBatch split on whitespace before
// handling list markers, so "-" survived as its own token and killed
// the batch. normalizeListLines runs first now to strip those.

function unitTestUrlPasteParsing() {
  console.log("\n=== C8: URL paste parsing ===");
  const {
    parseUrlLike,
    parseUrlLikeBatch,
    // eslint-disable-next-line @typescript-eslint/no-require-imports
  } =
    require("../src/lib/onboarding/url-paste") as typeof import("../src/lib/onboarding/url-paste");

  const dashList = parseUrlLikeBatch(
    "- https://a.com\n- https://b.com\n- https://c.com",
  );
  assert(
    dashList?.length === 3 &&
      dashList[0] === "https://a.com/" &&
      dashList[2] === "https://c.com/",
    "dash-prefixed bullet list returns all URLs",
  );

  const numbered = parseUrlLikeBatch("1. https://a.com\n2. https://b.com");
  assert(
    numbered?.length === 2 &&
      numbered[0] === "https://a.com/" &&
      numbered[1] === "https://b.com/",
    "numbered list returns all URLs",
  );

  const starList = parseUrlLikeBatch("* https://a.com\n* https://b.com");
  assert(
    starList?.length === 2 && starList[1] === "https://b.com/",
    "asterisk list returns all URLs",
  );

  const commaList = parseUrlLikeBatch("https://a.com, https://b.com");
  assert(
    commaList?.length === 2 && commaList[0] === "https://a.com/",
    "comma-separated URLs (no bullets) still parse — regression guard",
  );

  const oneBad = parseUrlLikeBatch("- not a url\n- https://a.com");
  assert(oneBad === null, "one bad token returns null (whole batch fails)");

  const single = parseUrlLikeBatch("https://a.com");
  assert(
    single === null,
    "single URL returns null from batch path — parseUrlLike handles it",
  );

  // The exact input from the original bug report.
  const fireworks = parseUrlLikeBatch(
    [
      "- https://fireworks.ai/blog/vercel",
      "- https://fireworks.ai/blog/genspark",
      "- https://fireworks.ai/blog/Story-Notion",
      "- https://fireworks.ai/blog/Story-Sentient",
      "- https://fireworks.ai/blog/story-sourcegraph-code-generation",
      "- https://fireworks.ai/blog/story-cresta-knowledge-assist",
    ].join("\n"),
  );
  assert(
    fireworks?.length === 6,
    "the exact bug-report bullet list returns six URLs",
  );

  // Sanity check: parseUrlLike still works in isolation
  assert(
    parseUrlLike("https://a.com") === "https://a.com/",
    "parseUrlLike normalizes a bare URL",
  );
}

// ── C9: ICP prompt embeds structured hypothesis ────────────────────────────
//
// Bug repro: the orchestrator inferred a structured product value
// (category, JTBD, wedge) but the interviewer prompt only saw
// dim.summary. The chat route + interview-actions now pass dim.value
// through, the icp-definition wrapper renders it, and the prompt embeds
// it under "Structured value (...)" so the model can confirm/correct.

function unitTestIcpPromptStructuredHypothesis() {
  console.log("\n=== C9: ICP prompt embeds structured hypothesis ===");
  if (!ICP_DEFINITION_TEMPLATE.agenticMode) {
    throw new Error("expected agentic template");
  }

  const productDim = makeDim(
    {
      category: "AI inference platform",
      core_jtbd: "Run open-source models in production",
      wedge: "Fastest cold-start in the market",
    },
    0.45,
    0.75,
    "needs_question",
  );

  const prompt = ICP_DEFINITION_TEMPLATE.interviewerSystemPrompt({
    isRefresh: false,
    nextDimension: ICP_DEFINITION_TEMPLATE.dimensions.find(
      (d) => d.key === "product",
    )!,
    currentHypothesis: "Fireworks looks like an AI inference platform.",
    positiveExemplarCount: 4,
    hypothesisValue: productDim.value,
    hypothesisConfidence: productDim.confidence,
  });

  assert(
    prompt.includes("AI inference platform"),
    "prompt embeds inferred category",
  );
  assert(
    prompt.includes("Run open-source models in production"),
    "prompt embeds inferred core_jtbd",
  );
  assert(
    prompt.includes("Fastest cold-start in the market"),
    "prompt embeds inferred wedge",
  );
  assert(
    prompt.includes("Completeness"),
    "prompt surfaces completeness + threshold",
  );
  assert(
    prompt.includes("confirm or correct"),
    "prompt instructs model to confirm or correct (not ask cold)",
  );
  assert(
    prompt.includes("Structured value"),
    "prompt heads the structured-value block explicitly",
  );
}

// ── C10: ICP prompt has no copyable example sentences ──────────────────────
//
// Bug repro: the prompt contained Example: "What's the JTBD your
// product replaces, and what's the wedge in?" which the model copied
// verbatim. Anti-regression: every Example: "..." string is gone, and
// the specific failure-mode strings stay out.

function unitTestIcpPromptHasNoExampleSentences() {
  console.log("\n=== C10: ICP prompt has no copyable example sentences ===");
  if (!ICP_DEFINITION_TEMPLATE.agenticMode) {
    throw new Error("expected agentic template");
  }

  // Build prompts for both branches to make sure neither path leaks an
  // example string. Branch A: structured hypothesis present.
  const productDim = makeDim(
    {
      category: "AI inference platform",
      core_jtbd: "X",
      wedge: "Y",
    },
    0.45,
    0.75,
    "needs_question",
  );
  const productDimDef = ICP_DEFINITION_TEMPLATE.dimensions.find(
    (d) => d.key === "product",
  )!;

  const promptWithHypothesis = ICP_DEFINITION_TEMPLATE.interviewerSystemPrompt({
    isRefresh: false,
    nextDimension: productDimDef,
    currentHypothesis: "summary",
    positiveExemplarCount: 4,
    hypothesisValue: productDim.value,
    hypothesisConfidence: productDim.confidence,
  });

  // Branch B: no hypothesis (zero positive exemplars, product dimension)
  const promptWithoutHypothesis =
    ICP_DEFINITION_TEMPLATE.interviewerSystemPrompt({
      isRefresh: false,
      nextDimension: productDimDef,
      currentHypothesis: "summary",
      positiveExemplarCount: 0,
    });

  for (const [label, prompt] of [
    ["with hypothesis", promptWithHypothesis],
    ["without hypothesis", promptWithoutHypothesis],
  ] as const) {
    assert(
      !prompt.includes("Example:"),
      `prompt (${label}) has no "Example:" sentence`,
    );
    assert(
      !prompt.includes("What's the JTBD your product replaces"),
      `prompt (${label}) does not contain the bug-report failure mode string`,
    );
    assert(
      !prompt.includes("and what's the wedge in"),
      `prompt (${label}) does not contain the wedge-template tail`,
    );
  }
}

// ── C11: hasMeaningfulHypothesisValue predicate ────────────────────────────
//
// Bug repro guardrail: if this predicate ever flips on a fully
// defaulted firmographics object (because employee_range_max=10000 > 0
// looks like a meaningful number), the prompt will spuriously offer
// "confirm or correct" guidance over an empty rubric.

function unitTestHasMeaningfulHypothesisValue() {
  console.log("\n=== C11: hasMeaningfulHypothesisValue predicate ===");

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { hasMeaningfulHypothesisValue } =
    require("../src/lib/onboarding/templates/icp-definition") as typeof import("../src/lib/onboarding/templates/icp-definition");

  // Product
  assert(
    !hasMeaningfulHypothesisValue("product", {
      category: "",
      core_jtbd: "",
      wedge: "",
    }),
    "all-empty product → false",
  );
  assert(
    !hasMeaningfulHypothesisValue("product", {
      category: "   ",
      core_jtbd: "\n\t",
      wedge: "",
    }),
    "whitespace-only product → false (.trim() rule)",
  );
  assert(
    hasMeaningfulHypothesisValue("product", {
      category: "AI inference",
      core_jtbd: "",
      wedge: "",
    }),
    "product with one filled field → true",
  );

  // Firmographics — the critical numeric-default case
  assert(
    !hasMeaningfulHypothesisValue("firmographics", {
      industries: [],
      employee_range_min: 0,
      employee_range_max: 10000,
      stages: [],
      geographies: [],
    }),
    "fully defaulted firmographics → false (defaults must not look meaningful)",
  );
  assert(
    hasMeaningfulHypothesisValue("firmographics", {
      industries: [],
      employee_range_min: 50,
      employee_range_max: 500,
      stages: [],
      geographies: [],
    }),
    "firmographics with non-default range → true",
  );
  assert(
    hasMeaningfulHypothesisValue("firmographics", {
      industries: ["devtools"],
      employee_range_min: 0,
      employee_range_max: 10000,
      stages: [],
      geographies: [],
    }),
    "firmographics with default range but one industry → true",
  );

  // Disqualifiers
  assert(
    !hasMeaningfulHypothesisValue("disqualifiers", []),
    "empty disqualifiers → false",
  );
  assert(
    hasMeaningfulHypothesisValue("disqualifiers", ["pre-seed companies"]),
    "disqualifiers with one entry → true",
  );

  // Arrays of blank strings — would-be false positive guard
  assert(
    !hasMeaningfulHypothesisValue("disqualifiers", [""]),
    'disqualifiers [""] → false (blank entry doesn\'t count)',
  );
  assert(
    !hasMeaningfulHypothesisValue("disqualifiers", ["", "  ", "\n"]),
    "disqualifiers of all-whitespace strings → false",
  );
  assert(
    !hasMeaningfulHypothesisValue("firmographics", {
      industries: ["", "  "],
      employee_range_min: 0,
      employee_range_max: 10000,
      stages: [""],
      geographies: [],
    }),
    "firmographics with only blank-string array entries + default range → false",
  );
}

async function resolveUserId(email: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .single();
  return data?.user_id ?? null;
}

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
  await supabase
    .from("profiles")
    .update({ user_type: null })
    .eq("user_id", userId);
}

async function seedReviewInterview(
  userId: string,
  extracted: IcpEdits,
): Promise<string> {
  const { data, error } = await supabase
    .from("onboarding_interviews")
    .insert({
      user_id: userId,
      is_refresh: false,
      template_id: "icp_definition",
      template_version: "v1",
      status: "review",
      messages: [],
      topics_covered: [],
      ready_for_extraction: true,
      extracted,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`seed interview failed: ${error?.message}`);
  }
  return data.id;
}

// ── C1: edit divergence ────────────────────────────────────────────────────

async function integrationTestEditDivergence(userId: string): Promise<string> {
  console.log(
    "\n--- C1: user edits reach BOTH memory docs AND icp_rubric ---\n",
  );
  await resetUser(userId);

  // extracted = A (orchestrator's version)
  const interviewId = await seedReviewInterview(userId, ICP_FIXTURE_A);

  // 3 positive exemplars — realistic shape, not required for confirm
  await supabase.from("onboarding_artifacts").insert(
    [1, 2, 3].map((i) => ({
      user_id: userId,
      interview_id: interviewId,
      kind: "positive_example",
      source_type: "url",
      source_url: `https://example.com/customer-${i}`,
      source_label: `Customer ${i}`,
      status: "succeeded",
      normalized_markdown: `Customer ${i} context`,
      created_from_template_id: "icp_definition",
    })),
  );

  // edits = B (user's review-screen version)
  const { performConfirm } =
    await import("../src/app/(app)/onboard/confirm-logic");
  const result = await performConfirm(
    supabase,
    userId,
    interviewId,
    ICP_FIXTURE_B,
  );
  assert(result.ok, `performConfirm returns ok (err: ${result.error})`);

  // Memory doc assertions — pass on main, lock in regression-wise
  const { data: memDocs } = await supabase
    .from("memory_documents")
    .select("document_key, content")
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  const memByKey = new Map(
    (memDocs ?? []).map((d) => [d.document_key as string, d.content as string]),
  );

  const companyIcp = memByKey.get("company_icp") ?? "";
  assert(
    companyIcp.includes("Revenue intelligence platform"),
    "memory[company_icp]: B's product.category present",
  );
  assert(
    companyIcp.includes("vertical-saas") && companyIcp.includes("healthtech"),
    "memory[company_icp]: B's industries present",
  );
  assert(
    !companyIcp.includes("devtools"),
    "memory[company_icp]: A's 'devtools' NOT present (edits override)",
  );

  const disqDoc = memByKey.get("icp_disqualifiers") ?? "";
  assert(
    disqDoc.includes("PLG-only") && disqDoc.includes("< $10M ARR"),
    "memory[icp_disqualifiers]: B's disqualifiers present",
  );
  assert(
    !disqDoc.includes("Enterprise-only"),
    "memory[icp_disqualifiers]: A's 'Enterprise-only' NOT present",
  );

  const proofDoc = memByKey.get("icp_proof_points") ?? "";
  assert(
    proofDoc.includes("Beta Corp") && proofDoc.includes("Gamma Inc"),
    "memory[icp_proof_points]: B's customers present",
  );
  assert(
    !proofDoc.includes("Acme"),
    "memory[icp_proof_points]: A's 'Acme' NOT present",
  );

  // Rubric assertions — FAIL on main, drive the fix
  const { data: sp } = await supabase
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", userId)
    .maybeSingle();
  const rubric = sp?.icp_rubric as Record<string, unknown> | null;
  assert(!!rubric, "user_scoring_profiles.icp_rubric row exists");

  if (rubric) {
    const product = rubric.product as { category?: string } | undefined;
    assert(
      product?.category === "Revenue intelligence platform",
      `rubric.product.category === B (got '${product?.category}')`,
    );

    const firmo = rubric.firmographics as { industries?: string[] } | undefined;
    assert(
      Array.isArray(firmo?.industries) &&
        firmo.industries.includes("vertical-saas") &&
        firmo.industries.includes("healthtech"),
      `rubric.firmographics.industries has B's values (got ${JSON.stringify(
        firmo?.industries,
      )})`,
    );
    assert(
      Array.isArray(firmo?.industries) &&
        !firmo.industries.includes("devtools"),
      "rubric.firmographics.industries does NOT include A's 'devtools'",
    );

    const disq = (
      rubric.disqualifiers as
        | { behavioral_disqualifiers?: string[] }
        | undefined
    )?.behavioral_disqualifiers;
    assert(
      Array.isArray(disq) &&
        disq.includes("PLG-only") &&
        disq.includes("< $10M ARR"),
      `rubric.disqualifiers has B's values (got ${JSON.stringify(disq)})`,
    );
    assert(
      Array.isArray(disq) && !disq.includes("Enterprise-only"),
      "rubric.disqualifiers does NOT include A's 'Enterprise-only'",
    );

    const proof = rubric.proof_points as
      | { existing_customers?: string[] }
      | undefined;
    assert(
      Array.isArray(proof?.existing_customers) &&
        proof.existing_customers.includes("Beta Corp") &&
        proof.existing_customers.includes("Gamma Inc"),
      "rubric.proof_points.existing_customers has B's values",
    );
    assert(
      Array.isArray(proof?.existing_customers) &&
        !proof.existing_customers.includes("Acme"),
      "rubric.proof_points.existing_customers does NOT include A's 'Acme'",
    );
  }

  return interviewId;
}

// ── C7: idempotency ────────────────────────────────────────────────────────

async function integrationTestIdempotency(userId: string, interviewId: string) {
  console.log("\n--- C7: idempotency (second confirm with same edits) ---\n");

  await supabase
    .from("onboarding_interviews")
    .update({ status: "review" })
    .eq("id", interviewId);

  const { performConfirm } =
    await import("../src/app/(app)/onboard/confirm-logic");
  const r = await performConfirm(supabase, userId, interviewId, ICP_FIXTURE_B);
  assert(r.ok, `second performConfirm returns ok (err: ${r.error})`);

  const { count: memCount } = await supabase
    .from("memory_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  assert(memCount === 3, `memory_documents count = 3 (got ${memCount})`);

  const { count: cfgCount } = await supabase
    .from("pipeline_config")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assert(cfgCount === 1, `pipeline_config count = 1 (got ${cfgCount})`);

  const { count: spCount } = await supabase
    .from("user_scoring_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assert(spCount === 1, `user_scoring_profiles count = 1 (got ${spCount})`);
}

// ── C6: persona preflight ──────────────────────────────────────────────────

async function integrationTestPersonaPreflight(userId: string) {
  console.log("\n--- C6: persona preflight ---\n");

  // Case 1: user_type=null → writes 'gtm'
  await resetUser(userId);
  const int1 = await seedReviewInterview(userId, ICP_FIXTURE_A);
  const { performConfirm } =
    await import("../src/app/(app)/onboard/confirm-logic");
  const r1 = await performConfirm(supabase, userId, int1, ICP_FIXTURE_A);
  assert(r1.ok, `user_type=null + ICP confirm succeeds (err: ${r1.error})`);
  const { data: p1 } = await supabase
    .from("profiles")
    .select("user_type")
    .eq("user_id", userId)
    .single();
  assert(p1?.user_type === "gtm", "profiles.user_type written to 'gtm'");

  // Case 2: user_type='gtm' re-confirm → idempotent
  await supabase
    .from("onboarding_interviews")
    .update({ status: "review" })
    .eq("id", int1);
  const r2 = await performConfirm(supabase, userId, int1, ICP_FIXTURE_A);
  assert(r2.ok, `user_type='gtm' re-confirm idempotent (err: ${r2.error})`);

  // Case 3: user_type='job_seeker' → blocked, no leaks
  await resetUser(userId);
  await supabase
    .from("profiles")
    .update({ user_type: "job_seeker" })
    .eq("user_id", userId);
  const int3 = await seedReviewInterview(userId, ICP_FIXTURE_A);
  const r3 = await performConfirm(supabase, userId, int3, ICP_FIXTURE_A);
  assert(!r3.ok, "user_type='job_seeker' + ICP confirm blocked");
  assert(
    !!r3.error && r3.error.includes("mix personas"),
    `error mentions persona mismatch (got: ${r3.error})`,
  );

  const { count: leakedMem } = await supabase
    .from("memory_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("origin", "onboarding");
  assert(leakedMem === 0, "no memory docs leaked on blocked confirm");

  const { count: leakedCfg } = await supabase
    .from("pipeline_config")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  assert(leakedCfg === 0, "no pipeline_config leaked on blocked confirm");

  const { data: leakedRubric } = await supabase
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", userId)
    .maybeSingle();
  assert(!leakedRubric?.icp_rubric, "no icp_rubric leaked on blocked confirm");
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Unit tests first — fast feedback, no DB
  unitTestScarcityClamp();
  unitTestNextDimensionToAsk();
  unitTestAdapterCoercion();
  unitTestDisagreements();
  unitTestUrlPasteParsing();
  unitTestIcpPromptStructuredHypothesis();
  unitTestIcpPromptHasNoExampleSentences();
  unitTestHasMeaningfulHypothesisValue();

  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));
  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }
  console.log(`\nTesting with user ${userId}`);

  const interviewId = await integrationTestEditDivergence(userId);
  await integrationTestIdempotency(userId, interviewId);
  await integrationTestPersonaPreflight(userId);

  // Reset first (which nulls user_type), THEN restore to job_seeker so
  // the rest of the test suite sees a consistent default persona. The
  // previous order was inverted — resetUser nulled the persona we just set.
  await resetUser(userId);
  await supabase
    .from("profiles")
    .update({ user_type: "job_seeker" })
    .eq("user_id", userId);

  console.log(
    `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
