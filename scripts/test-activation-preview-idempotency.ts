#!/usr/bin/env tsx

import { config } from "dotenv";
import type { PipelineConfigRow } from "../src/lib/supabase/types";
import {
  createMockSupabase,
  freshJobs,
  getJSearchCallCount,
  resetState,
  restoreFetch,
  seedUser,
  setBlockOpportunityClaims,
  setJSearchResponses,
  tables,
} from "./test-activation-preview-idempotency-helpers";

config({ path: ".env.local" });

process.env.RAPIDAPI_KEY ||= "test-fixture-key";
process.env.EXA_API_KEY ||= "test-fixture-key";

let failures = 0;
let scoreCallCount = 0;

function analysis() {
  const dim = () => ({ score: 3.5, justification: "Fixture evidence." });
  const scorecard = (keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, dim()]));
  return {
    company_name: "FixtureCo",
    role_title: "GTM Engineer",
    jd_fit: {
      scorecard: scorecard([
        "years_seniority",
        "core_responsibilities",
        "technical_requirements",
        "industry_domain",
        "outcome_evidence",
        "soft_skills",
        "gap_risk",
      ]),
      total_score: 3.5,
      verdict: "Solid match",
      requirement_matches: [
        {
          requirement: "Build pipeline",
          status: "STRONG MATCH",
          evidence: "Fixture evidence.",
          notes: "Fixture notes.",
        },
      ],
    },
    strategic_fit: {
      scorecard: scorecard([
        "market_familiarity",
        "product_adjacency",
        "gtm_motion_match",
        "ai_technical_edge",
        "founder_alignment",
        "stage_match",
      ]),
      total_score: 3.5,
      verdict: "Worth exploring",
    },
    company_overview: {
      what_they_do: "Fixture product.",
      stage_and_funding: "Series B.",
      gtm_motion: "Sales-led.",
      founder_profile: { name: "Founder", background: "Operator." },
    },
    flags: { green: ["Relevant"], red: [], orange: [] },
    interview_angle: "Talk pipeline.",
    outreach_angle: {
      hook: "Relevant role.",
      bullets: ["Pipeline work"],
      bridge: "I can help.",
      ask: "Open to chat?",
    },
    positioning_recommendations: ["Lead with GTM systems."],
    bottom_line: "Fixture result.",
  };
}

function resetCase() {
  resetState();
  scoreCallCount = 0;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    failures++;
    console.error(`  FAIL: ${message}`);
  } else {
    console.log(`  PASS: ${message}`);
  }
}

async function main() {
  const { __setRunGenerateObjectForTests } = await import("../src/lib/ai/calls");
  const { claimActivationRun } = await import("../src/lib/pipeline/activation-lock");
  const { runActivationSearch } = await import("../src/lib/pipeline/activation");
  const svc = createMockSupabase();

  console.log("Activation preview and idempotency regression");
  console.log("=============================================");

  __setRunGenerateObjectForTests((args) => {
    scoreCallCount++;
    return args.schema.parse(analysis());
  });

  resetCase();
  seedUser("preview-user", { activation_started_at: new Date().toISOString() });
  setJSearchResponses([freshJobs(8), freshJobs(8)]);
  const previewConfig = tables.pipeline_config[0] as unknown as PipelineConfigRow;
  const preview = await runActivationSearch(svc, "preview-user", previewConfig);
  assert(getJSearchCallCount() === 1, "preview stopped after first JSearch response");
  assert(preview.stats.discovered === 5, `preview discovered 5 roles (got ${preview.stats.discovered})`);
  assert(preview.stats.inserted === 5, `preview inserted 5 roles (got ${preview.stats.inserted})`);
  assert(preview.stats.scored === 5, `preview scored 5 roles (got ${preview.stats.scored})`);
  assert(scoreCallCount === 5, `scoring called 5 times (got ${scoreCallCount})`);
  assert(tables.opportunities.every((opp) => opp.stage === "scored"), "all preview opportunities scored");
  assert(tables.opportunities.every((opp) => opp.processing_started_at === null), "claims released after scoring");
  assert(Boolean(previewConfig.activation_completed_at), "success sets activation_completed_at");
  assert(previewConfig.activation_started_at === null, "success clears activation_started_at");

  resetCase();
  seedUser("locked-user", { activation_started_at: new Date().toISOString() });
  const locked = await claimActivationRun(svc, "locked-user");
  if (locked) {
    await runActivationSearch(
      svc,
      "locked-user",
      tables.pipeline_config[0] as unknown as PipelineConfigRow,
    );
  }
  assert(locked === false, "fresh activation lock blocks duplicate run");
  assert(getJSearchCallCount() === 0, "duplicate run made no JSearch calls");
  assert(scoreCallCount === 0, "duplicate run made no scoring calls");

  resetCase();
  seedUser("claimed-user");
  setBlockOpportunityClaims(true);
  setJSearchResponses([freshJobs(1)]);
  const skipped = await runActivationSearch(
    svc,
    "claimed-user",
    tables.pipeline_config[0] as unknown as PipelineConfigRow,
  );
  const skippedOpp = tables.opportunities[0];
  assert(skipped.stats.discovered === 1, "claim-skip run discovered one role");
  assert(skipped.stats.errors === 0, "claim-skip run did not record an error");
  assert(scoreCallCount === 0, "claim-skip run made no scoring call");
  assert(skippedOpp.stage === "discovered", "claim-skip opportunity stayed discovered");
  assert(skippedOpp.last_error === null, "claim-skip opportunity kept last_error null");

  __setRunGenerateObjectForTests(null);
  restoreFetch();

  if (failures > 0) {
    console.error(`FAILED: ${failures} assertion(s) did not pass`);
    process.exitCode = 1;
  } else {
    console.log("PASSED: activation preview and idempotency behavior is locked");
  }
}

main().catch(async (err) => {
  const { __setRunGenerateObjectForTests } = await import("../src/lib/ai/calls");
  __setRunGenerateObjectForTests(null);
  restoreFetch();
  console.error("Test runner crashed:", err);
  process.exitCode = 1;
});
