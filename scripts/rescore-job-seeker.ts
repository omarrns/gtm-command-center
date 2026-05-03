#!/usr/bin/env tsx
/**
 * Targeted job-seeker rescore utility.
 *
 * Default is dry-run. Add --apply to mutate rows through scoreOneOpportunity.
 *
 * Examples:
 *   pnpm rescore:job-seeker -- --email bloomtea@proton.me
 *   pnpm rescore:job-seeker -- --user-id 781f76dc-... --apply
 */

import { config } from "dotenv";
import type { PipelineConfigRow, ProfileRow } from "../src/lib/supabase/types";
import { MODELS } from "../src/lib/ai/anthropic";
import { createSupabaseServiceClient } from "../src/lib/supabase/service";
import { newRunId } from "../src/lib/logger";
import { scoreOneOpportunity } from "../src/lib/pipeline/steps/score";
import {
  claimOpportunity,
  releaseOpportunity,
} from "../src/lib/pipeline/opportunities";

config({ path: ".env.local" });

interface Args {
  userId?: string;
  email?: string;
  apply: boolean;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, limit: 10 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--user-id") {
      args.userId = argv[++i];
    } else if (arg === "--email") {
      args.email = argv[++i];
    } else if (arg === "--limit") {
      args.limit = Number(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.userId && !args.email) {
    throw new Error("Pass --user-id <uuid> or --email <address>.");
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
    throw new Error("--limit must be an integer from 1 to 50.");
  }
  return args;
}

async function resolveUserId(args: Args): Promise<string> {
  if (args.userId) return args.userId;
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc
    .from("profiles")
    .select("user_id, email")
    .eq("email", args.email!)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No profile found for email ${args.email}.`);
  return (data as Pick<ProfileRow, "user_id">).user_id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const svc = createSupabaseServiceClient();
  const userId = await resolveUserId(args);
  const runId = newRunId();

  const { data: configRow, error: configError } = await svc
    .from("pipeline_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (configError) throw configError;
  if (!configRow) throw new Error(`No pipeline_config row for ${userId}.`);

  const { data: profile, error: profileError } = await svc
    .from("profiles")
    .select("user_type, email")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.user_type === "gtm") {
    throw new Error("Refusing to run job-seeker rescore for a GTM profile.");
  }

  const { data: opportunities, error: oppError } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .eq("source", "jsearch")
    .eq("stage", "discovered")
    .order("discovered_at", { ascending: true })
    .limit(args.limit);
  if (oppError) throw oppError;

  const rows = opportunities ?? [];
  console.log(
    `${args.apply ? "Applying" : "Dry run:"} ${rows.length} discovered job-seeker rows for ${profile?.email ?? userId}`,
  );
  for (const opp of rows) {
    console.log(
      `- ${opp.id} | ${opp.company_name} | ${opp.role_title ?? "(no role)"} | last_error=${opp.last_error ?? "(none)"}`,
    );
  }
  if (!args.apply) {
    console.log("\nNo rows changed. Re-run with --apply to score these rows.");
    return;
  }

  let scored = 0;
  let filtered = 0;
  let errors = 0;
  for (const opp of rows) {
    let claimed = false;
    try {
      claimed = await claimOpportunity(svc, opp.id, userId);
      if (!claimed) {
        console.log(`  SKIP ${opp.id}: already claimed by another run`);
        continue;
      }
      const result = await scoreOneOpportunity(
        svc,
        userId,
        opp,
        configRow as PipelineConfigRow,
        {
          source: "manual-rescore",
          model: MODELS.jobSeekerScoring,
          runId,
        },
      );
      if (result.newStage === "scored") scored++;
      else filtered++;
      console.log(
        `  OK ${opp.id}: ${result.newStage} score=${result.normalizedScore}`,
      );
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      await svc
        .from("opportunities")
        .update({ last_error: message })
        .eq("id", opp.id)
        .eq("user_id", userId);
      console.error(`  ERROR ${opp.id}: ${message}`);
    } finally {
      if (claimed) await releaseOpportunity(svc, opp.id, userId);
    }
  }

  console.log(
    `\nDone. runId=${runId} scored=${scored} filtered=${filtered} errors=${errors}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
