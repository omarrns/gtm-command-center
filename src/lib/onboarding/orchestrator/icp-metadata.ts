import {
  ICP_DIMENSIONS,
  calculateDimensionQuality,
  type CoreIcpDimensionKey,
  type SubDimensionEvidence,
} from "@/lib/onboarding/icp-dimensions";

export type IcpDimensionEvidence = Record<string, SubDimensionEvidence>;

export function mergeIcpDimensionEvidence(
  dimensionKey: string,
  ...sources: Array<unknown>
): IcpDimensionEvidence | undefined {
  const config = ICP_DIMENSIONS.find((dimension) => dimension.key === dimensionKey);
  if (!config) return undefined;

  const merged: IcpDimensionEvidence = {};
  let hasEvidence = false;
  for (const source of sources) {
    if (typeof source !== "object" || source === null || Array.isArray(source)) {
      continue;
    }
    const record = source as Record<string, unknown>;
    for (const field of config.subDimensions) {
      const evidence = record[field];
      if (isSubDimensionEvidence(evidence)) {
        merged[field] = evidence;
        hasEvidence = true;
      }
    }
  }
  return hasEvidence ? merged : undefined;
}

export function buildUserAnswerEvidence(
  dimensionKey: string,
  fields: string[],
  messageId: string,
  userAnswer: string,
): IcpDimensionEvidence | undefined {
  const config = ICP_DIMENSIONS.find((dimension) => dimension.key === dimensionKey);
  if (!config) return undefined;

  const allowed = new Set<string>(config.subDimensions);
  const evidence: IcpDimensionEvidence = {};
  for (const field of fields) {
    if (!allowed.has(field)) continue;
    evidence[field] = {
      strength: "direct_user_provided",
      proofPoints: [],
      sources: [
        {
          type: "user_answer",
          label: "user answer",
          quote: userAnswer.slice(0, 240),
        },
      ],
      notes: `Confirmed in message ${messageId}.`,
    };
  }
  return Object.keys(evidence).length > 0 ? evidence : undefined;
}

export function computeIcpDimensionMetadata(
  dimensionKey: string,
  value: unknown,
  evidence?: unknown,
) {
  const quality = calculateDimensionQuality(dimensionKey, value, evidence);
  return {
    confidence: quality.completeness,
    evidenceCoverage: quality.evidenceCoverage,
    missingFields: quality.missingFields,
    weakFields: quality.weakFields,
  };
}

function isSubDimensionEvidence(input: unknown): input is SubDimensionEvidence {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return false;
  }
  const record = input as Partial<SubDimensionEvidence>;
  return (
    record.strength === "direct_user_provided" ||
    record.strength === "inferred_from_customer_examples" ||
    record.strength === "inferred_from_public_data" ||
    record.strength === "weak_or_unknown"
  );
}

export function isCoreIcpDimensionKey(key: string): key is CoreIcpDimensionKey {
  return ICP_DIMENSIONS.some((dimension) => dimension.key === key);
}
