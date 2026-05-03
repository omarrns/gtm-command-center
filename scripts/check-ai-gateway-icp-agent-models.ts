import { gateway } from "ai";
import { MODELS } from "@/lib/ai/models";

const REQUIRED = [
  MODELS.icpChat,
  MODELS.icpSessionDistill,
  MODELS.icpEvidenceRouter,
  MODELS.icpRevisionCritic,
  MODELS.icpRevisionJudge,
] as const;

async function main() {
  const result = await gateway.getAvailableModels();
  const models = Array.isArray(result) ? result : result.models;
  const byId = new Map(models.map((model) => [model.id, model]));
  const missing = REQUIRED.filter((id) => !byId.has(id));

  for (const id of REQUIRED) {
    const model = byId.get(id);
    if (!model) continue;
    const pricing = model.pricing;
    console.log(
      `${id}: input=${pricing?.input ?? "?"}, output=${pricing?.output ?? "?"}`,
    );
  }

  if (missing.length > 0) {
    throw new Error(`Missing ICP agent model(s): ${missing.join(", ")}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
