import { z } from "zod";
import {
  buyerSchema,
  firmographicsSchema,
  productSchema,
  proofPointsSchema,
  signalsSchema,
  technographicsSchema,
} from "@/lib/onboarding/icp-schemas";

const DEFAULT_EMPLOYEE_MIN = 0;
const DEFAULT_EMPLOYEE_MAX = 10000;
const disqualifiersValueSchema = z.array(z.string()).default([]);

const DIMENSION_SCHEMAS: Record<string, z.ZodType<unknown>> = {
  product: productSchema,
  buyer: buyerSchema,
  firmographics: firmographicsSchema,
  technographics: technographicsSchema,
  signals: signalsSchema,
  disqualifiers: disqualifiersValueSchema,
  proof_points: proofPointsSchema,
};

function bulletList(values: readonly string[]): string {
  if (values.length === 0) return "- (none)";
  return values.map((v) => `- ${v}`).join("\n");
}

function safeParse<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function anyNonEmptyString(values: readonly unknown[]): boolean {
  return values.some((v) => isNonEmptyString(v));
}

function hasNonEmptyEntry(values: readonly string[]): boolean {
  return values.some(isNonEmptyString);
}

export function hasMeaningfulHypothesisValue(
  dimensionKey: string,
  value: unknown,
): boolean {
  const schema = DIMENSION_SCHEMAS[dimensionKey];
  if (!schema) return false;
  const parsed = safeParse(schema, value);
  if (parsed === null || parsed === undefined) return false;

  switch (dimensionKey) {
    case "product": {
      const v = parsed as z.infer<typeof productSchema>;
      return anyNonEmptyString([v.category, v.core_jtbd, v.wedge]);
    }
    case "buyer": {
      const v = parsed as z.infer<typeof buyerSchema>;
      return anyNonEmptyString([v.economic_buyer, v.champion, v.end_user]);
    }
    case "firmographics": {
      const v = parsed as z.infer<typeof firmographicsSchema>;
      const rangeIsCustom =
        v.employee_range_min !== DEFAULT_EMPLOYEE_MIN ||
        v.employee_range_max !== DEFAULT_EMPLOYEE_MAX;
      return (
        hasNonEmptyEntry(v.industries) ||
        hasNonEmptyEntry(v.stages) ||
        hasNonEmptyEntry(v.geographies) ||
        rangeIsCustom
      );
    }
    case "technographics": {
      const v = parsed as z.infer<typeof technographicsSchema>;
      return (
        hasNonEmptyEntry(v.required_tools) || hasNonEmptyEntry(v.excluded_tools)
      );
    }
    case "signals": {
      const v = parsed as z.infer<typeof signalsSchema>;
      return (
        hasNonEmptyEntry(v.hiring_roles) ||
        hasNonEmptyEntry(v.jtbd_evidence) ||
        hasNonEmptyEntry(v.trigger_events)
      );
    }
    case "disqualifiers": {
      const v = parsed as readonly string[];
      return hasNonEmptyEntry([...v]);
    }
    case "proof_points": {
      const v = parsed as z.infer<typeof proofPointsSchema>;
      return (
        hasNonEmptyEntry(v.existing_customers) ||
        hasNonEmptyEntry(v.won_deals) ||
        hasNonEmptyEntry(v.lost_deals_reasons)
      );
    }
    default:
      return false;
  }
}

export function renderDimensionValue(
  dimensionKey: string,
  value: unknown,
): string | null {
  const schema = DIMENSION_SCHEMAS[dimensionKey];
  if (!schema) return null;
  const parsed = safeParse(schema, value);
  if (parsed === null || parsed === undefined) return null;

  switch (dimensionKey) {
    case "product": {
      const v = parsed as z.infer<typeof productSchema>;
      return [
        `- **Category**: ${v.category || "(not set)"}`,
        `- **Core JTBD**: ${v.core_jtbd || "(not set)"}`,
        `- **Wedge**: ${v.wedge || "(not set)"}`,
      ].join("\n");
    }
    case "buyer": {
      const v = parsed as z.infer<typeof buyerSchema>;
      return [
        `- **Economic buyer**: ${v.economic_buyer || "(not set)"}`,
        `- **Champion**: ${v.champion || "(not set)"}`,
        `- **End user**: ${v.end_user || "(not set)"}`,
      ].join("\n");
    }
    case "firmographics": {
      const v = parsed as z.infer<typeof firmographicsSchema>;
      return [
        `- **Industries**: ${v.industries.join(", ") || "(none)"}`,
        `- **Employee range**: ${v.employee_range_min}-${v.employee_range_max}`,
        `- **Stages**: ${v.stages.join(", ") || "(none)"}`,
        `- **Geographies**: ${v.geographies.join(", ") || "(none)"}`,
      ].join("\n");
    }
    case "technographics": {
      const v = parsed as z.infer<typeof technographicsSchema>;
      return [
        `### Required\n${bulletList(v.required_tools)}`,
        `### Excluded\n${bulletList(v.excluded_tools)}`,
      ].join("\n\n");
    }
    case "signals": {
      const v = parsed as z.infer<typeof signalsSchema>;
      return [
        `### Hiring roles\n${bulletList(v.hiring_roles)}`,
        `### JTBD evidence\n${bulletList(v.jtbd_evidence)}`,
        `### Trigger events\n${bulletList(v.trigger_events)}`,
      ].join("\n\n");
    }
    case "disqualifiers": {
      const v = parsed as readonly string[];
      return bulletList([...v]);
    }
    case "proof_points": {
      const v = parsed as z.infer<typeof proofPointsSchema>;
      return [
        `### Existing customers\n${bulletList(v.existing_customers)}`,
        `### Won deals\n${bulletList(v.won_deals)}`,
        `### Lost deal reasons\n${bulletList(v.lost_deals_reasons)}`,
      ].join("\n\n");
    }
    default:
      return null;
  }
}
