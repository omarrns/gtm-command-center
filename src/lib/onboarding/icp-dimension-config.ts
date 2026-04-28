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
