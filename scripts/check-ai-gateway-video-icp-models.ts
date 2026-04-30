#!/usr/bin/env tsx

import { gateway } from "ai";
import { MODELS } from "../src/lib/ai/models";

const CANDIDATE_IDS = [
  MODELS.videoIcpReview,
  MODELS.videoIcpReviewFallback,
  "google/gemini-3.1-flash-lite-preview",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
] as const;

type GatewayModel = {
  id: string;
  name?: string;
  pricing?: {
    input?: string;
    output?: string;
    cachedInputTokens?: string;
  };
};

function isGatewayModel(value: unknown): value is GatewayModel {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  );
}

async function main() {
  const result = await gateway.getAvailableModels();
  const models = Array.isArray(result.models)
    ? result.models.filter(isGatewayModel)
    : [];
  const byId = new Map(models.map((model) => [model.id, model]));

  console.log("Video ICP Gateway model candidates\n");
  for (const id of CANDIDATE_IDS) {
    const model = byId.get(id);
    if (!model) {
      console.log(`MISSING ${id}`);
      continue;
    }
    console.log(
      [
        `FOUND ${model.id}`,
        model.name ? `name=${model.name}` : null,
        model.pricing?.input ? `input=${model.pricing.input}` : null,
        model.pricing?.output ? `output=${model.pricing.output}` : null,
        model.pricing?.cachedInputTokens
          ? `cachedInput=${model.pricing.cachedInputTokens}`
          : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" "),
    );
  }

  if (!byId.has(MODELS.videoIcpReview)) {
    throw new Error(`${MODELS.videoIcpReview} is not available in AI Gateway.`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
