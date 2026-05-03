import assert from "node:assert/strict";
import { MODELS } from "@/lib/ai/models";
import {
  routedEvidenceSchema,
  revisionJudgeSchema,
  revisionProposalSchema,
  sessionInsightSchema,
} from "@/lib/icp-agent/schemas";
import {
  applyNarrativePatches,
  applyRubricPatches,
} from "@/lib/icp-agent/patches";
import { coerceIcpRubric } from "@/lib/onboarding/icp-schemas";

function testSchemas() {
  const insight = sessionInsightSchema.parse({
    summary: "Account repeatedly described workspace cost showback pain.",
    keySignals: ["workspace-level reporting"],
    objections: [],
    buyerLanguage: ["I need showback by customer workspace"],
    icpContradictions: [],
    suggestedUpdates: [
      {
        target: "rubric",
        path: "/signals/pain_language",
        suggestedValue: "workspace-level showback",
        reason: "Repeated buyer language",
        confidence: 0.91,
      },
    ],
    explicitUpdateRequest: true,
  });
  assert.equal(insight.explicitUpdateRequest, true);

  const routed = routedEvidenceSchema.parse({
    items: [
      {
        evidenceType: "icp_calibration",
        title: "Workspace showback",
        detail: "Buyer framed this as a compliance requirement.",
        target: "signals.pain_language",
        confidence: 0.9,
        shouldEvaluateRevision: true,
      },
    ],
  });
  assert.equal(routed.items[0]?.shouldEvaluateRevision, true);

  revisionProposalSchema.parse({
    shouldPropose: true,
    target: "rubric",
    title: "Add workspace showback pain language",
    reason: "Evidence appeared in a qualified account conversation.",
    confidence: 0.86,
    patches: [
      {
        op: "append",
        path: "/signals/pain_language",
        value: "workspace-level showback is a compliance requirement",
      },
    ],
  });

  revisionJudgeSchema.parse({
    approved: true,
    confidence: 0.84,
    reason: "Patch is narrow and evidence-backed.",
    risks: [],
  });
}

function testRubricPatches() {
  const rubric = coerceIcpRubric({
    signals: { pain_language: ["slow shared inference"] },
  });
  const result = applyRubricPatches(rubric, [
    {
      op: "append",
      path: "/signals/pain_language",
      value: "workspace-level showback is a compliance requirement",
    },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    const after = result.after as unknown as typeof rubric;
    assert.deepEqual(result.changedPaths, ["/signals/pain_language"]);
    assert.ok(
      after.signals.pain_language.includes(
        "workspace-level showback is a compliance requirement",
      ),
    );
  }

  const rejected = applyRubricPatches(rubric, [
    { op: "append", path: "/buyer/economic_buyer", value: "CFO" },
  ]);
  assert.equal(rejected.ok, false);
}

function testNarrativePatches() {
  const result = applyNarrativePatches("## Decision Criteria\n\n- latency", [
    {
      op: "append",
      path: "/decision_criteria",
      value: "workspace-level reporting",
    },
  ]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.changedPaths, ["/decision_criteria"]);
    assert.match(String(result.after.content), /workspace-level reporting/);
  }
}

function testModelRouting() {
  assert.equal(MODELS.icpSessionDistill, "deepseek/deepseek-v4-flash");
  assert.equal(MODELS.icpEvidenceRouter, "deepseek/deepseek-v4-flash");
  assert.equal(MODELS.icpRevisionCritic, "deepseek/deepseek-v4-pro");
  assert.equal(MODELS.icpRevisionJudge, "google/gemini-3-flash");
  assert.notEqual(MODELS.icpSessionDistill, MODELS.haiku);
}

testSchemas();
testRubricPatches();
testNarrativePatches();
testModelRouting();

console.log("✓ icp agent loop tests passed");
