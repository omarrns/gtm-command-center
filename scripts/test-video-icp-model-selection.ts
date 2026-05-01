#!/usr/bin/env tsx

import { __setRunGenerateObjectForTests } from "../src/lib/ai/calls";
import { MODELS } from "../src/lib/ai/models";
import { runVideoIcpAnalysis } from "../src/lib/jobs/handlers/video-icp-review";
import type { VideoIcpAnalysis } from "../src/lib/video-icp/schemas";

const ANALYSIS_FIXTURE = {
  personas: [
    {
      id: "cfo",
      name: "CFO buyer",
      role: "Chief Financial Officer",
      context: "Owns budget and risk review.",
      priorities: ["payback", "control"],
      likelyObjections: ["unclear ROI"],
    },
    {
      id: "revops",
      name: "RevOps evaluator",
      role: "Revenue Operations",
      context: "Evaluates workflow fit.",
      priorities: ["speed", "data quality"],
      likelyObjections: ["integration effort"],
    },
  ],
  overall: {
    summary: "Directional review.",
    strongestMoments: [],
    weakestMoments: [],
    recommendedEdits: ["Tighten the opening proof point."],
  },
  timeline: [
    {
      startSec: 30,
      personaId: "cfo",
      reactionType: "objection",
      severity: "medium",
      quote: "We save time.",
      interpretation: "The claim needs economic proof.",
      recommendedEdit: "Quantify the time savings.",
    },
  ],
  ctaFit: [
    {
      personaId: "cfo",
      fit: "mixed",
      reasoning: "CTA is relevant but not urgent.",
      missingQuestions: ["What is payback period?"],
    },
  ],
} satisfies VideoIcpAnalysis;

type ModelCall = {
  model: string;
  callPurpose: string | undefined;
  structuredOutputMode: string | undefined;
};

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  PASS: ${message}`);
    return;
  }
  failures += 1;
  console.error(`  FAIL: ${message}`);
}

async function main() {
  console.log("Video ICP model selection\n");

  const calls: ModelCall[] = [];
  __setRunGenerateObjectForTests((args) => {
    calls.push({
      model: args.model,
      callPurpose: args.scope?.callPurpose,
      structuredOutputMode: args.structuredOutputMode,
    });
    if (calls.length === 1) {
      throw new Error("forced Gemini failure");
    }
    return args.schema.parse(ANALYSIS_FIXTURE);
  });

  try {
    const result = await runVideoIcpAnalysis({
      userId: "22222222-2222-4222-8222-222222222222",
      reviewId: "11111111-1111-4111-8111-111111111111",
      system: "system",
      prompt: "prompt",
    });

    assert(
      result.overall.summary === ANALYSIS_FIXTURE.overall.summary,
      "fallback result is returned when primary generation fails",
    );
    assert(
      calls[0]?.model === MODELS.videoIcpReview,
      "primary attempt uses the Video ICP Gemini model",
    );
    assert(
      calls[0]?.callPurpose === "video-icp-review",
      "primary attempt keeps the Video ICP call purpose",
    );
    assert(
      calls[0]?.structuredOutputMode === undefined,
      "primary Gemini attempt does not pass Anthropic structured-output mode",
    );
    assert(
      calls[1]?.model === MODELS.videoIcpReviewFallback,
      "fallback attempt uses the Video ICP Sonnet fallback model",
    );
    assert(
      calls[1]?.callPurpose === "video-icp-review-fallback",
      "fallback attempt uses the fallback call purpose",
    );
  } finally {
    __setRunGenerateObjectForTests(null);
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  __setRunGenerateObjectForTests(null);
  console.error(err);
  process.exit(1);
});
