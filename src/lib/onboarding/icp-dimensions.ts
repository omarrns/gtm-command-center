import { ICP_DIMENSIONS } from "@/lib/onboarding/icp-dimension-config";
import type {
  CoreIcpRubric,
  DisqualifiersIcpRubric,
  EmployeeRange,
  EvidenceSource,
  EvidenceSourceType,
  EvidenceStrength,
  IcpEvidence,
  IcpRubric,
  ProofPointsIcpRubric,
  SubDimensionEvidence,
} from "@/lib/onboarding/icp-types";

export { ICP_ENUMS } from "@/lib/onboarding/icp-enums";
export {
  calculateCompleteness,
  calculateDimensionQuality,
  calculateEvidenceCoverage,
  changedSubDimensionKeys,
  getCoreDimensionKeys,
  hasMeaningfulDimensionValue,
  renderDimensionValue,
  renderPromptChecklist,
  shouldSkipDimension,
  type DimensionQuality,
  type PromptChecklistMode,
  type SkipDimensionInput,
} from "@/lib/onboarding/icp-quality";
export {
  CORE_ICP_DIMENSION_KEYS,
  ICP_DIMENSIONS,
  type CoreIcpDimensionKey,
  type IcpDimensionConfig,
} from "@/lib/onboarding/icp-dimension-config";
export {
  buildAccountScoringBreakdownSchema,
  computeAccountScoreFromBreakdown,
  detectDisqualifierOverride,
  type AccountScoringBreakdown,
  type AccountScoringSubDimension,
  type DisqualifierOverride,
  type SubDimensionWeightMap,
} from "@/lib/onboarding/icp-scoring";

export type {
  BuyerIcpRubric,
  CoreIcpRubric,
  DisqualifiersIcpRubric,
  EmployeeRange,
  EvidenceSource,
  EvidenceSourceType,
  EvidenceStrength,
  FirmographicsIcpRubric,
  IcpEvidence,
  IcpRubric,
  ProductIcpRubric,
  ProofPointsIcpRubric,
  SignalsIcpRubric,
  SubDimensionEvidence,
  TechnographicsIcpRubric,
} from "@/lib/onboarding/icp-types";

const DEFAULT_EMPLOYEE_MAX = 10000;

const DEFAULT_RUBRIC_CORE: CoreIcpRubric = {
  product: {
    category: "",
    core_jtbd: "",
    wedge: "",
    delivery_model: "",
  },
  buyer: {
    economic_buyer: "",
    champion: "",
    end_user: "",
    deal_blocker: "",
  },
  firmographics: {
    industries: [],
    business_model: "",
    employee_range: {
      min: 0,
      max: DEFAULT_EMPLOYEE_MAX,
    },
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
};

const DEFAULT_PROOF_POINTS: ProofPointsIcpRubric = {
  existing_customers: [],
  won_deals: [],
  lost_deals_reasons: [],
};

export function createDefaultSubDimensionEvidence(): SubDimensionEvidence {
  return {
    strength: "weak_or_unknown",
    proofPoints: [],
    sources: [],
    notes: "",
  };
}

export function getDefaultEvidence(): IcpEvidence {
  return Object.fromEntries(
    ICP_DIMENSIONS.map((dimension) => [
      dimension.key,
      Object.fromEntries(
        dimension.subDimensions.map((subDimension) => [
          subDimension,
          createDefaultSubDimensionEvidence(),
        ]),
      ),
    ]),
  ) as IcpEvidence;
}

export function getDefaultRubric(): IcpRubric {
  return {
    product: { ...DEFAULT_RUBRIC_CORE.product },
    buyer: { ...DEFAULT_RUBRIC_CORE.buyer },
    firmographics: {
      industries: [],
      business_model: "",
      employee_range: { ...DEFAULT_RUBRIC_CORE.firmographics.employee_range },
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
    proof_points: { ...DEFAULT_PROOF_POINTS },
    evidence: getDefaultEvidence(),
  };
}

export function coerceIcpRubric(input: unknown): IcpRubric {
  const raw = asRecord(input) ?? {};
  const maybeNestedIcp = asRecord(raw.icp);
  const source = maybeNestedIcp ? { ...raw, ...maybeNestedIcp } : raw;
  const defaults = getDefaultRubric();
  const firmographics = asRecord(source.firmographics);
  const disqualifiers = source.disqualifiers;

  return {
    product: {
      ...defaults.product,
      ...pickStringFields(asRecord(source.product), [
        "category",
        "core_jtbd",
        "wedge",
        "delivery_model",
      ]),
    },
    buyer: {
      ...defaults.buyer,
      ...pickStringFields(asRecord(source.buyer), [
        "economic_buyer",
        "champion",
        "end_user",
        "deal_blocker",
      ]),
    },
    firmographics: {
      industries: stringArray(firmographics?.industries),
      business_model: stringValue(firmographics?.business_model) ?? "",
      employee_range: coerceEmployeeRange(firmographics),
      stages: stringArray(firmographics?.stages),
      geographies: stringArray(firmographics?.geographies),
    },
    technographics: {
      required_tools: stringArray(
        asRecord(source.technographics)?.required_tools,
      ),
      excluded_tools: stringArray(
        asRecord(source.technographics)?.excluded_tools,
      ),
      tech_maturity:
        stringValue(asRecord(source.technographics)?.tech_maturity) ?? "",
      data_infrastructure:
        stringValue(asRecord(source.technographics)?.data_infrastructure) ?? "",
    },
    signals: {
      hiring_roles: stringArray(asRecord(source.signals)?.hiring_roles),
      jtbd_evidence: stringArray(asRecord(source.signals)?.jtbd_evidence),
      trigger_events: stringArray(asRecord(source.signals)?.trigger_events),
      pain_language: stringArray(asRecord(source.signals)?.pain_language),
    },
    disqualifiers: coerceDisqualifiers(disqualifiers),
    proof_points: {
      ...defaults.proof_points,
      ...pickStringArrayFields(asRecord(source.proof_points), [
        "existing_customers",
        "won_deals",
        "lost_deals_reasons",
      ]),
    },
    evidence: coerceEvidence(raw.evidence),
  };
}

function coerceEmployeeRange(
  firmographics: Record<string, unknown> | null,
): EmployeeRange {
  const nested = asRecord(firmographics?.employee_range);
  const min =
    numberValue(nested?.min) ??
    numberValue(firmographics?.employee_range_min) ??
    0;
  const nestedMax = nullableNumberValue(nested?.max);
  const max =
    nestedMax !== undefined
      ? nestedMax
      : (numberValue(firmographics?.employee_range_max) ??
        DEFAULT_EMPLOYEE_MAX);
  return { min: Math.max(0, min), max: max === null ? null : Math.max(0, max) };
}

function coerceDisqualifiers(input: unknown): DisqualifiersIcpRubric {
  if (Array.isArray(input)) {
    return {
      ...DEFAULT_RUBRIC_CORE.disqualifiers,
      behavioral_disqualifiers: stringArray(input),
    };
  }
  const record = asRecord(input);
  return {
    tech_disqualifiers: stringArray(record?.tech_disqualifiers),
    size_disqualifiers: stringValue(record?.size_disqualifiers) ?? "",
    stage_disqualifiers: stringArray(record?.stage_disqualifiers),
    behavioral_disqualifiers: stringArray(record?.behavioral_disqualifiers),
  };
}

function coerceEvidence(input: unknown): IcpEvidence {
  const defaults = getDefaultEvidence();
  const writableEvidence = defaults as unknown as Record<
    string,
    Record<string, SubDimensionEvidence>
  >;
  const evidence = asRecord(input);
  if (!evidence) return defaults;

  for (const dimension of ICP_DIMENSIONS) {
    const dimensionEvidence = asRecord(evidence[dimension.key]);
    if (!dimensionEvidence) continue;
    for (const subDimension of dimension.subDimensions) {
      const rawSubEvidence = asRecord(dimensionEvidence[subDimension]);
      if (!rawSubEvidence) continue;
      writableEvidence[dimension.key][subDimension] = {
        strength: coerceEvidenceStrength(rawSubEvidence.strength),
        proofPoints: stringArray(rawSubEvidence.proofPoints),
        sources: coerceEvidenceSources(rawSubEvidence.sources),
        notes: stringValue(rawSubEvidence.notes) ?? "",
      };
    }
  }

  return defaults;
}

function coerceEvidenceStrength(input: unknown): EvidenceStrength {
  if (
    input === "direct_user_provided" ||
    input === "inferred_from_customer_examples" ||
    input === "inferred_from_public_data" ||
    input === "weak_or_unknown"
  ) {
    return input;
  }
  if (input === "strong") return "direct_user_provided";
  if (input === "moderate") return "inferred_from_customer_examples";
  return "weak_or_unknown";
}

function coerceEvidenceSources(input: unknown): EvidenceSource[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((source) => {
    if (typeof source === "string") {
      return source.trim() ? [{ type: "artifact", label: source }] : [];
    }
    const record = asRecord(source);
    const label = stringValue(record?.label);
    if (!record || !label) return [];
    return [
      {
        type: coerceEvidenceSourceType(record.type),
        label,
        ...(typeof record.quote === "string" ? { quote: record.quote } : {}),
      },
    ];
  });
}

function coerceEvidenceSourceType(input: unknown): EvidenceSourceType {
  return input === "url" ||
    input === "user_answer" ||
    input === "public_research" ||
    input === "artifact"
    ? input
    : "artifact";
}

function asRecord(input: unknown): Record<string, unknown> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

function stringValue(input: unknown): string | undefined {
  return typeof input === "string" ? input : undefined;
}

function numberValue(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input)
    ? input
    : undefined;
}

function nullableNumberValue(input: unknown): number | null | undefined {
  if (input === null) return null;
  return numberValue(input);
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((value): value is string => typeof value === "string")
    : [];
}

function pickStringFields<const K extends readonly string[]>(
  input: Record<string, unknown> | null,
  keys: K,
): Partial<Record<K[number], string>> {
  return Object.fromEntries(
    keys.flatMap((key) => {
      const value = stringValue(input?.[key]);
      return value === undefined ? [] : [[key, value]];
    }),
  ) as Partial<Record<K[number], string>>;
}

function pickStringArrayFields<const K extends readonly string[]>(
  input: Record<string, unknown> | null,
  keys: K,
): Partial<Record<K[number], string[]>> {
  return Object.fromEntries(
    keys.map((key) => [key, stringArray(input?.[key])]),
  ) as Partial<Record<K[number], string[]>>;
}
