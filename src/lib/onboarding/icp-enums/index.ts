import { businessModelValues } from "@/lib/onboarding/icp-enums/business-models";
import { dataInfrastructureValues } from "@/lib/onboarding/icp-enums/data-infrastructure";
import { deliveryModelValues } from "@/lib/onboarding/icp-enums/delivery-model";
import { employeeRangeBands } from "@/lib/onboarding/icp-enums/employee-range";
import { geographyValues } from "@/lib/onboarding/icp-enums/geographies";
import { stageValues } from "@/lib/onboarding/icp-enums/stages";
import { techMaturityValues } from "@/lib/onboarding/icp-enums/tech-maturity";

export const ICP_ENUMS = {
  businessModelValues,
  dataInfrastructureValues,
  deliveryModelValues,
  employeeRangeBands,
  geographyValues,
  stageValues,
  techMaturityValues,
} as const;
