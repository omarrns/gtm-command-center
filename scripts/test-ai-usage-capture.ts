#!/usr/bin/env tsx
/**
 * Unit coverage for AI SDK usage -> ai_calls token mapping.
 *
 * Run: pnpm test:ai-usage-capture
 */

import assert from "node:assert/strict";
import { aiUsageTokens, aiUsageTokensFrom } from "../src/lib/ai/calls";

async function main() {
  const usage = {
    inputTokens: 123,
    inputTokenDetails: {
      noCacheTokens: 120,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
    },
    outputTokens: 45,
    outputTokenDetails: {
      textTokens: 40,
      reasoningTokens: 5,
    },
    totalTokens: 168,
  };

  assert.deepEqual(aiUsageTokens(usage), {
    inputTokens: 123,
    outputTokens: 45,
    totalTokens: 168,
  });
  assert.deepEqual(await aiUsageTokensFrom(Promise.resolve(usage)), {
    inputTokens: 123,
    outputTokens: 45,
    totalTokens: 168,
  });
  assert.deepEqual(await aiUsageTokensFrom(Promise.reject(new Error("no usage"))), {});
  console.log("PASSED: AI usage token mapping is locked");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
