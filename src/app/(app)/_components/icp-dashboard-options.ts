// Pre-mapped enum option lists for the GTM dashboard's EditableField
// instances. Lives in a sibling file so icp-dashboard-fields.tsx stays
// under the 400-line cap; option arrays are pure data, no JSX.

import { ICP_ENUMS, humanizeEnumValue } from "@/lib/onboarding/icp-dimensions";

function asOptions(values: readonly string[]) {
  return values.map((value) => ({ value, label: humanizeEnumValue(value) }));
}

export const DELIVERY_MODEL_OPTIONS = asOptions(ICP_ENUMS.deliveryModelValues);
export const BUSINESS_MODEL_OPTIONS = asOptions(ICP_ENUMS.businessModelValues);
export const TECH_MATURITY_OPTIONS = asOptions(ICP_ENUMS.techMaturityValues);
export const DATA_INFRASTRUCTURE_OPTIONS = asOptions(
  ICP_ENUMS.dataInfrastructureValues,
);
export const STAGE_OPTIONS = asOptions(ICP_ENUMS.stageValues);
export const GEOGRAPHY_OPTIONS = asOptions(ICP_ENUMS.geographyValues);
