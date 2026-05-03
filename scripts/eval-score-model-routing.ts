#!/usr/bin/env tsx
/**
 * Report-only replay gate for job-seeker score model candidates.
 *
 * Usage:
 *   pnpm eval:score-model-routing -- --limit=3 --since=7d --run-live
 *   pnpm eval:score-model-routing -- --model=deepseek/deepseek-v4-pro --limit=1 --run-live
 *   pnpm eval:score-model-routing -- --models=deepseek/deepseek-v4-pro,google/gemini-3.1-pro-preview --limit=1 --run-live
 *   pnpm eval:score-model-routing -- --limit=0
 */

import { config } from "dotenv";
import { gateway, generateObject } from "ai";
import { createSupabaseServiceClient } from "../src/lib/supabase/service";
import { MODELS } from "../src/lib/ai/models";
import { analysisSchema, type AnalysisResult } from "../src/lib/pipeline/scoring";

config({ path: ".env.local" });

interface AiCallRow {
  id: string;
  created_at: string;
  system_prompt: string;
  user_prompt: string;
  response_object: unknown;
}

interface Args {
  limit: number;
  since: string;
  runLive: boolean;
  models: string[] | null;
}

const CANDIDATE_MODELS = [
  MODELS.sonnet,
  MODELS.analysisSynthesis,
  MODELS.deepseekNarrative,
] as const;

const PRICES: Record<string, { input: number; output: number }> = {
  [MODELS.sonnet]: { input: 3, output: 15 },
  [MODELS.analysisSynthesis]: { input: 0.5, output: 3 },
  [MODELS.deepseekNarrative]: { input: 0.435, output: 0.87 },
  "google/gemini-2.5-pro": { input: 1.25, output: 10 },
  "google/gemini-3.1-pro-preview": { input: 2, output: 12 },
};

async function main() {
  const args = parseArgs();
  const cases = await loadCases(args);
  console.log(`Loaded ${cases.length} captured score calls since ${args.since}.`);
  if (!args.runLive || cases.length === 0) {
    console.log("Dry run only. Add --run-live to replay candidate models.");
    return;
  }

  for (const testCase of cases) {
    const baseline = analysisSchema.safeParse(testCase.response_object);
    const baselineScore = baseline.success ? scoreTotal(baseline.data) : null;
    console.log(`\nCASE ${testCase.id} ${testCase.created_at}`);
    console.log(`baseline_schema=${baseline.success} baseline_total=${formatScore(baselineScore)}`);

    for (const model of candidateModels(args)) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        const result = await generateObject({
          output: "object",
          model: gateway(model),
          system: systemForModel(model, testCase.system_prompt),
          prompt: promptForModel(model, testCase.user_prompt),
          schema: analysisSchema,
          maxOutputTokens: maxOutputTokensForModel(model),
          abortSignal: controller.signal,
          providerOptions: model.startsWith("anthropic/")
            ? { anthropic: { structuredOutputMode: "jsonTool" as const } }
            : undefined,
        });
        const candidateScore = scoreTotal(result.object);
        const semantic = semanticStatus(result.object);
        const cost = estimateCost(model, result.usage?.inputTokens, result.usage?.outputTokens);
        console.log(
          [
            "PASS",
            model,
            `${Date.now() - startedAt}ms`,
            `semantic=${semantic}`,
            `total=${formatScore(candidateScore)}`,
            `delta=${formatDelta(candidateScore, baselineScore)}`,
            `tokens=${result.usage?.totalTokens ?? "-"}`,
            `est=$${cost.toFixed(4)}`,
          ].join("\t"),
        );
      } catch (err) {
        console.log(
          ["FAIL", model, `${Date.now() - startedAt}ms`, errorMessage(err)].join("\t"),
        );
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}

async function loadCases(args: Args): Promise<AiCallRow[]> {
  if (args.limit === 0) return [];
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("ai_calls")
    .select("id, created_at, system_prompt, user_prompt, response_object")
    .eq("call_purpose", "score")
    .eq("call_kind", "object")
    .is("error", null)
    .not("system_prompt", "is", null)
    .not("user_prompt", "is", null)
    .not("response_object", "is", null)
    .gte("created_at", sinceIso(args.since))
    .order("created_at", { ascending: false })
    .limit(args.limit);
  if (error) throw error;
  return (data ?? []) as AiCallRow[];
}

function scoreTotal(result: AnalysisResult): number {
  return result.jd_fit.total_score + result.strategic_fit.total_score;
}

function semanticStatus(result: AnalysisResult): "ok" | "bad-score-range" {
  const jdScores = Object.values(result.jd_fit.scorecard).map((row) => row.score);
  const strategicScores = Object.values(result.strategic_fit.scorecard).map((row) => row.score);
  const dimensionScores = [...jdScores, ...strategicScores];
  const dimensionsOk = dimensionScores.every((score) => score >= 0 && score <= 5);
  const totalsOk =
    result.jd_fit.total_score >= 0 &&
    result.jd_fit.total_score <= 35 &&
    result.strategic_fit.total_score >= 0 &&
    result.strategic_fit.total_score <= 30;
  return dimensionsOk && totalsOk ? "ok" : "bad-score-range";
}

function estimateCost(model: string, input = 0, output = 0): number {
  const price = PRICES[model] ?? { input: 0, output: 0 };
  return (input * price.input + output * price.output) / 1_000_000;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  return {
    limit: Number(readFlag(args, "--limit") ?? "5"),
    since: readFlag(args, "--since") ?? "7d",
    runLive: args.includes("--run-live"),
    models: readModels(args),
  };
}

function candidateModels(args: Args): readonly string[] {
  return args.models ?? CANDIDATE_MODELS;
}

function readModels(args: string[]): string[] | null {
  const value = readFlag(args, "--models") ?? readFlag(args, "--model");
  return value ? value.split(",").map((model) => model.trim()).filter(Boolean) : null;
}

function systemForModel(model: string, system: string): string {
  if (!isDeepSeek(model)) return system;
  return [
    system,
    "",
    "DeepSeek replay instructions:",
    "Return one compact JSON object that satisfies the schema.",
    "Do not include reasoning, markdown, prose, or explanatory text.",
    "Do not encode nested objects or arrays as strings.",
    "Keep every justification, note, risk, and recommendation short.",
  ].join("\n");
}

function promptForModel(model: string, prompt: string): string {
  if (!isDeepSeek(model)) return prompt;
  return [
    prompt,
    "",
    "For this replay, optimize for schema-valid compact output:",
    "- Use numeric dimension scores from 0 to 5.",
    "- Use total_score values equal to the sum of each scorecard.",
    "- Include at most 5 requirement_matches.",
    "- Keep text fields concise.",
  ].join("\n");
}

function maxOutputTokensForModel(model: string): number {
  return isDeepSeek(model) ? 4096 : 8192;
}

function isDeepSeek(model: string): boolean {
  return model.startsWith("deepseek/");
}

function readFlag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;
  const prefixed = args.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

function sinceIso(value: string): string {
  const match = value.match(/^(\d+)([hd])$/);
  if (!match) return value;
  const amount = Number(match[1]);
  const hours = match[2] === "d" ? amount * 24 : amount;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function formatScore(score: number | null): string {
  return score === null ? "-" : score.toFixed(1);
}

function formatDelta(score: number, baseline: number | null): string {
  return baseline === null ? "-" : (score - baseline).toFixed(1);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message.replace(/\s+/g, " ").slice(0, 160) : String(err);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
