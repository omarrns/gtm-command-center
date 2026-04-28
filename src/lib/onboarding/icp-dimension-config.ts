import { ICP_ENUMS } from "@/lib/onboarding/icp-enums";

export const CORE_ICP_DIMENSION_KEYS = [
  "product",
  "buyer",
  "firmographics",
  "technographics",
  "signals",
  "disqualifiers",
] as const;

export type CoreIcpDimensionKey = (typeof CORE_ICP_DIMENSION_KEYS)[number];

export interface IcpDimensionConfig {
  key: CoreIcpDimensionKey;
  label: string;
  subDimensions: readonly string[];
}

// Per-sub-dim type metadata. Sidecar map (rather than expanding
// IcpDimensionConfig.subDimensions to objects) so existing readers
// that iterate `subDimensions: readonly string[]` keep working.
//
// Architecture spec lines 197-203 enumerates the canonical type table.
// Two entries currently diverge from the spec because the runtime types
// haven't caught up yet: technographics.data_infrastructure is single-
// string (spec says enum_multi), signals.pain_language is string[]
// (spec says freetext). Both are flagged in the type comment so the
// gap is visible until the schema is widened.
export type SubDimensionType =
  | "freetext"
  | "enum_single"
  | "enum_multi"
  | "string_array"
  | "range";

const SUB_DIMENSION_TYPES: Record<string, SubDimensionType> = {
  "product.category": "freetext",
  "product.core_jtbd": "freetext",
  "product.wedge": "freetext",
  "product.delivery_model": "enum_single",
  "buyer.economic_buyer": "freetext",
  "buyer.champion": "freetext",
  "buyer.end_user": "freetext",
  "buyer.deal_blocker": "freetext",
  "firmographics.industries": "enum_multi",
  "firmographics.business_model": "enum_single",
  "firmographics.employee_range": "range",
  "firmographics.stages": "enum_multi",
  "firmographics.geographies": "enum_multi",
  "technographics.required_tools": "string_array",
  "technographics.excluded_tools": "string_array",
  "technographics.tech_maturity": "enum_single",
  // Spec says enum_multi; runtime stores a single string. Treat as
  // enum_single until the schema is widened.
  "technographics.data_infrastructure": "enum_single",
  "signals.hiring_roles": "string_array",
  "signals.jtbd_evidence": "string_array",
  "signals.trigger_events": "string_array",
  // Spec says freetext; runtime stores string[]. Treat as string_array.
  "signals.pain_language": "string_array",
  "disqualifiers.tech_disqualifiers": "string_array",
  "disqualifiers.size_disqualifiers": "freetext",
  "disqualifiers.stage_disqualifiers": "enum_multi",
  "disqualifiers.behavioral_disqualifiers": "string_array",
};

const ENUM_VALUES_BY_PATH: Record<string, readonly string[]> = {
  "product.delivery_model": ICP_ENUMS.deliveryModelValues,
  "firmographics.business_model": ICP_ENUMS.businessModelValues,
  "firmographics.stages": ICP_ENUMS.stageValues,
  "firmographics.geographies": ICP_ENUMS.geographyValues,
  "technographics.tech_maturity": ICP_ENUMS.techMaturityValues,
  "technographics.data_infrastructure": ICP_ENUMS.dataInfrastructureValues,
  "disqualifiers.stage_disqualifiers": ICP_ENUMS.stageValues,
  // firmographics.industries intentionally omitted: the canonical
  // 186-value list lives in docs/dimensions/pitchbook-industry-verticals.json
  // and hasn't been imported into a TS module yet. UI falls back to
  // free-form TagInput entry until that lands.
};

export function getSubDimensionType(
  dimensionKey: string,
  fieldKey: string,
): SubDimensionType {
  return SUB_DIMENSION_TYPES[`${dimensionKey}.${fieldKey}`] ?? "freetext";
}

export function getSubDimensionEnumValues(
  dimensionKey: string,
  fieldKey: string,
): readonly string[] | null {
  return ENUM_VALUES_BY_PATH[`${dimensionKey}.${fieldKey}`] ?? null;
}

// Display helper: enum values are stored as snake_case stable keys
// (`series_a`, `united_states`) and shown as Title Case in the UI.
// Caller-overridable for cases like `series_d_plus` → "Series D+";
// for now the naive split-capitalize is good enough.
export function humanizeEnumValue(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const ICP_DIMENSIONS = [
  {
    key: "product",
    label: "Product",
    subDimensions: ["category", "core_jtbd", "wedge", "delivery_model"],
  },
  {
    key: "buyer",
    label: "Buyer",
    subDimensions: ["economic_buyer", "champion", "end_user", "deal_blocker"],
  },
  {
    key: "firmographics",
    label: "Firmographics",
    subDimensions: [
      "industries",
      "business_model",
      "employee_range",
      "stages",
      "geographies",
    ],
  },
  {
    key: "technographics",
    label: "Technographics",
    subDimensions: [
      "required_tools",
      "excluded_tools",
      "tech_maturity",
      "data_infrastructure",
    ],
  },
  {
    key: "signals",
    label: "Signals",
    subDimensions: [
      "hiring_roles",
      "jtbd_evidence",
      "trigger_events",
      "pain_language",
    ],
  },
  {
    key: "disqualifiers",
    label: "Disqualifiers",
    subDimensions: [
      "tech_disqualifiers",
      "size_disqualifiers",
      "stage_disqualifiers",
      "behavioral_disqualifiers",
    ],
  },
] as const satisfies readonly IcpDimensionConfig[];
