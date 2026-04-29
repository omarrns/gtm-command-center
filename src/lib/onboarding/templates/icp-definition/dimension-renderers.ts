import {
  hasMeaningfulDimensionValue,
  renderDimensionValue,
} from "@/lib/onboarding/icp-dimensions";

export function hasMeaningfulHypothesisValue(
  dimensionKey: string,
  value: unknown,
): boolean {
  return hasMeaningfulDimensionValue(dimensionKey, value);
}

export { renderDimensionValue };
