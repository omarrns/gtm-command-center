import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  coerceIcpRubric,
  parseIcpRubric,
  safeParseIcpRubric,
  type IcpRubric,
} from "../src/lib/onboarding/icp-schemas";
import {
  ICP_DIMENSIONS,
  buildAccountScoringBreakdownSchema,
  calculateCompleteness,
  calculateEvidenceCoverage,
  computeAccountScoreFromBreakdown,
  detectDisqualifierOverride,
  dominantEvidenceLabel,
  getCoreDimensionKeys,
  hasMeaningfulDimensionValue,
  renderDimensionValue,
  renderPromptChecklist,
  shouldSkipDimension,
  type AccountScoringBreakdown,
} from "../src/lib/onboarding/icp-dimensions";
import { ICP_DEFINITION_TEMPLATE } from "../src/lib/onboarding/templates/icp-definition";

let failures = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
  } else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

const oldRubric = {
  product: {
    category: "AI SDR",
    core_jtbd: "Find accounts",
    wedge: "Devtools GTM teams",
  },
  buyer: {
    economic_buyer: "VP Sales",
    champion: "RevOps",
    end_user: "SDR",
  },
  firmographics: {
    industries: ["devtools"],
    employee_range_min: 20,
    employee_range_max: 200,
    stages: ["Series A"],
    geographies: ["US"],
  },
  technographics: {
    required_tools: ["Salesforce"],
    excluded_tools: ["Zoho"],
  },
  signals: {
    hiring_roles: ["SDR"],
    jtbd_evidence: ["Manual research"],
    trigger_events: ["New VP Sales"],
  },
  disqualifiers: ["No outbound", "Enterprise-only"],
  proof_points: {
    existing_customers: ["Acme"],
    won_deals: ["Acme expansion"],
    lost_deals_reasons: ["Too much procurement"],
  },
};

const normalized = parseIcpRubric(oldRubric);
assert(normalized.product.category === "AI SDR", "old product preserved");
assert(
  normalized.firmographics.employee_range.min === 20 &&
    normalized.firmographics.employee_range.max === 200,
  "employee_range_min/max converts to employee_range",
);
assert(
  normalized.disqualifiers.behavioral_disqualifiers.includes("No outbound") &&
    normalized.disqualifiers.tech_disqualifiers.length === 0,
  "disqualifiers string[] converts to structured behavioral field",
);
assert(
  normalized.proof_points.existing_customers.includes("Acme"),
  "proof_points preserved as calibration data",
);
assert(
  !Object.keys(normalized.evidence).includes("proof_points"),
  "proof_points is not counted as a core evidence dimension",
);
assert(
  normalized.evidence.firmographics.employee_range.strength ===
    "weak_or_unknown",
  "default sub-dimension evidence is weak_or_unknown",
);
assert(
  normalized.evidence.product.delivery_model.strength === "weak_or_unknown",
  "new product.delivery_model evidence defaults",
);
assert(
  normalized.evidence.technographics.data_infrastructure.strength ===
    "weak_or_unknown",
  "new technographics.data_infrastructure evidence defaults",
);

const newRubric: IcpRubric = {
  ...normalized,
  firmographics: {
    ...normalized.firmographics,
    employee_range: { min: 51, max: null },
  },
  disqualifiers: {
    tech_disqualifiers: ["Zoho"],
    size_disqualifiers: "Under 10 employees",
    stage_disqualifiers: ["Public company"],
    behavioral_disqualifiers: ["No outbound"],
  },
  evidence: {
    ...normalized.evidence,
    product: {
      ...normalized.evidence.product,
      category: {
        strength: "direct_user_provided",
        proofPoints: ["User confirmed category"],
        sources: [{ type: "user_answer", label: "ICP interview" }],
        notes: "Directly confirmed",
      },
    },
  },
};

const reparsed = parseIcpRubric(newRubric);
assert(
  reparsed.firmographics.employee_range.max === null,
  "new employee_range parses unchanged",
);
assert(
  reparsed.disqualifiers.size_disqualifiers === "Under 10 employees",
  "new structured disqualifiers parse unchanged",
);
assert(
  reparsed.evidence.product.category.strength === "direct_user_provided",
  "existing evidence metadata is preserved",
);
assert(
  reparsed.evidence.product.category.sources[0]?.type === "user_answer",
  "structured evidence sources are preserved",
);
assert(safeParseIcpRubric(oldRubric).success, "safeParse accepts old rubric");
assert(
  coerceIcpRubric({ icp: oldRubric }).buyer.economic_buyer === "VP Sales",
  "nested extraction-shaped rubric coerces",
);
assert(
  getCoreDimensionKeys().length === 6 &&
    !getCoreDimensionKeys().includes("proof_points" as never),
  "core dimension keys exclude proof_points",
);
assert(
  calculateCompleteness("product", normalized.product) === 0.75,
  "product completeness counts configured sub-dimensions",
);
assert(
  calculateCompleteness("firmographics", normalized.firmographics) === 0.8,
  "firmographics completeness handles enum arrays and range",
);
assert(
  calculateEvidenceCoverage(
    "product",
    reparsed.product,
    reparsed.evidence.product,
  ) === 0.25,
  "evidence coverage excludes weak_or_unknown (per-dim evidence contract)",
);
assert(
  dominantEvidenceLabel("product", reparsed.evidence.product) ===
    "Mixed: some user-confirmed",
  "dominantEvidenceLabel: partial map with one direct_user_provided reads as mixed",
);
assert(
  dominantEvidenceLabel("product", undefined) === "Weak evidence",
  "dominantEvidenceLabel: missing evidence treats every sub-dim as weak",
);
assert(
  dominantEvidenceLabel("product", {
    category: {
      strength: "direct_user_provided",
      proofPoints: [],
      sources: [],
      notes: "",
    },
    core_jtbd: {
      strength: "direct_user_provided",
      proofPoints: [],
      sources: [],
      notes: "",
    },
    wedge: {
      strength: "direct_user_provided",
      proofPoints: [],
      sources: [],
      notes: "",
    },
    delivery_model: {
      strength: "direct_user_provided",
      proofPoints: [],
      sources: [],
      notes: "",
    },
  }) === "User-confirmed",
  "dominantEvidenceLabel: all sub-dims direct_user_provided reads as User-confirmed",
);
assert(
  hasMeaningfulDimensionValue("signals", normalized.signals),
  "hasMeaningfulDimensionValue works for configured arrays",
);
assert(
  renderDimensionValue("firmographics", normalized.firmographics)?.includes(
    "Employee Range",
  ) === true,
  "renderDimensionValue renders configured fields",
);
assert(
  renderPromptChecklist({
    mode: "focused_interview",
    dimensionKey: "buyer",
  }).includes("deal_blocker"),
  "renderPromptChecklist includes configured sub-dimensions",
);
assert(
  !shouldSkipDimension("product", {
    value: normalized.product,
    threshold: 0.75,
    evidenceCoverage: 0.25,
    missingFields: ["delivery_model"],
    weakFields: ["category"],
  }),
  "skip rule blocks missing and weak unconfirmed fields",
);
assert(
  shouldSkipDimension("firmographics", {
    value: {
      industries: ["devtools"],
      business_model: "",
      employee_range: { min: 20, max: 200 },
      stages: ["series_a"],
      geographies: ["US"],
    },
    threshold: 0.75,
    evidenceCoverage: 0.8,
    missingFields: ["business_model"],
    weakFields: [],
  }),
  "skip rule allows threshold-met completeness without every sub-field",
);
assert(
  shouldSkipDimension("product", {
    value: reparsed.product,
    threshold: 0.75,
    evidenceCoverage: 0,
    missingFields: [],
    weakFields: ["category", "core_jtbd", "wedge", "delivery_model"],
    confirmedWeakFields: ["category", "core_jtbd", "wedge", "delivery_model"],
  }),
  "skip rule allows directly confirmed weak fields",
);
assert(
  ICP_DEFINITION_TEMPLATE.completionTopicThreshold === 4 &&
    !ICP_DEFINITION_TEMPLATE.topics.includes("proof_points" as never) &&
    !("proof_points" in ICP_DEFINITION_TEMPLATE.topicLabels),
  "ICP template no longer routes proof_points as a core topic",
);

// ── Phase 5: account scoring schema + helpers ─────────────────────────────

function buildBreakdownFromScore(score: number): AccountScoringBreakdown {
  const out = {} as Record<
    string,
    Record<string, { score: number; reasoning: string }>
  >;
  for (const dimension of ICP_DIMENSIONS) {
    const sub: Record<string, { score: number; reasoning: string }> = {};
    for (const subDimension of dimension.subDimensions) {
      sub[subDimension] = { score, reasoning: `placeholder ${subDimension}` };
    }
    out[dimension.key] = sub;
  }
  return out as AccountScoringBreakdown;
}

const scoringSchema = buildAccountScoringBreakdownSchema();
const validBreakdown = buildBreakdownFromScore(3);
assert(
  scoringSchema.safeParse(validBreakdown).success,
  "buildAccountScoringBreakdownSchema accepts the canonical sub-dimension shape",
);

const missingSubDimension = JSON.parse(
  JSON.stringify(validBreakdown),
) as AccountScoringBreakdown;
delete (missingSubDimension.product as Record<string, unknown>).delivery_model;
assert(
  scoringSchema.safeParse(missingSubDimension).success === false,
  "scoring schema is closed — missing sub-dimension fails validation",
);

// Schema intentionally permissive on the numeric value — Sonnet
// occasionally emits decimals or out-of-range integers and rejecting
// them as a hard schema failure breaks the whole 31-field structured
// output. Normalisation (round + clamp) lives in
// computeAccountScoreFromBreakdown and is asserted end-to-end in
// scripts/test-pipeline-regression.ts.
const outOfRange = buildBreakdownFromScore(6);
assert(
  scoringSchema.safeParse(outOfRange).success === true,
  "scoring schema accepts numeric scores outside 1-5 (loosened)",
);

assert(
  computeAccountScoreFromBreakdown(buildBreakdownFromScore(5)) === 100,
  "uniform 5/5 breakdown normalises to 100",
);
assert(
  computeAccountScoreFromBreakdown(buildBreakdownFromScore(1)) === 0,
  "uniform 1/5 breakdown normalises to 0",
);
assert(
  computeAccountScoreFromBreakdown(buildBreakdownFromScore(3)) === 50,
  "uniform 3/5 breakdown normalises to 50",
);

const noOverride = detectDisqualifierOverride(buildBreakdownFromScore(5));
assert(
  noOverride.triggered === false && noOverride.triggers.length === 0,
  "high disqualifier scores do not trigger override",
);

const triggeredBreakdown = buildBreakdownFromScore(4);
triggeredBreakdown.disqualifiers.tech_disqualifiers = {
  score: 1,
  reasoning: "Account uses Zoho — explicit tech disqualifier match.",
};
const override = detectDisqualifierOverride(triggeredBreakdown);
assert(
  override.triggered === true &&
    override.triggers[0]?.subDimension === "tech_disqualifiers",
  "score=1 on a disqualifier sub-dim triggers override",
);

assert(
  renderPromptChecklist({ mode: "full_scoring" }).includes(
    "behavioral_disqualifiers",
  ),
  "full_scoring checklist enumerates structured disqualifier sub-dimensions",
);
assert(
  renderPromptChecklist({
    mode: "compact_extraction",
    dimensionKey: "firmographics",
  }).includes("united_states"),
  "checklist enumerates canonical geography enum values (Phase 9 fix)",
);
assert(
  renderPromptChecklist({
    mode: "compact_extraction",
    dimensionKey: "firmographics",
  }).includes("(enum_multi)"),
  "checklist labels enum_multi sub-dimensions with their type",
);
assert(
  renderPromptChecklist({
    mode: "compact_extraction",
    dimensionKey: "firmographics",
  }).includes("(range)"),
  "checklist labels employee_range as range type",
);

const loaderFiles = [
  "src/app/(app)/_actions/update-icp-rubric.ts",
  "src/app/(app)/_components/icp-dashboard.tsx",
  "src/app/api/activation/accounts/route.ts",
  "src/app/api/cron/dormant-discover/route.ts",
  "src/app/api/webhooks/theirstack/route.ts",
  "src/lib/onboarding/templates/icp-definition.ts",
  "src/lib/pipeline/gtm-runner.ts",
  "src/lib/pipeline/steps/discover-contacts-account.ts",
  "scripts/pull-theirstack-direct.ts",
  "scripts/rescore-theirstack.ts",
];

for (const file of loaderFiles) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  assert(
    source.includes("safeParseIcpRubric") ||
      source.includes("parseIcpRubric") ||
      source.includes("coerceIcpRubric"),
    `${file} normalizes icp_rubric loads`,
  );
}

console.log(
  `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
);
if (failures > 0) process.exit(1);
