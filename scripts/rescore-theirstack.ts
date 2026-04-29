/**
 * One-off: re-score the current real TheirStack rows against the current
 * (possibly updated) ICP rubric. Resets stage to 'discovered' first so
 * scoreOneAccount's precondition holds.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import {
  claimOpportunity,
  releaseOpportunity,
} from "@/lib/pipeline/opportunities";
import { scoreOneAccount } from "@/lib/pipeline/steps/score-accounts";
import { parseIcpRubric } from "@/lib/onboarding/icp-schemas";
import type { OpportunityRow, PipelineConfigRow } from "@/lib/supabase/types";

const USER_ID = "7217874b-9288-41af-bb39-c53920a47da6";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing supabase env");
  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const [scoringRes, configRes, oppsRes] = await Promise.all([
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", USER_ID)
      .maybeSingle(),
    svc
      .from("pipeline_config")
      .select("*")
      .eq("user_id", USER_ID)
      .maybeSingle(),
    svc
      .from("opportunities")
      .select("*")
      .eq("user_id", USER_ID)
      .eq("source", "theirstack")
      .not("company_name", "ilike", "TestCo%")
      .order("discovered_at", { ascending: false }),
  ]);

  const rubric = parseIcpRubric(scoringRes.data?.icp_rubric);
  const cfg = configRes.data as PipelineConfigRow | null;
  if (!cfg) throw new Error("no pipeline_config");

  const rows = (oppsRes.data as OpportunityRow[] | null) ?? [];
  console.log(`[rescore] ${rows.length} real theirstack rows found\n`);

  for (const opp of rows) {
    console.log(
      `--- ${opp.company_name} (prev stage=${opp.stage}, prev score=${opp.score ?? "NULL"}) ---`,
    );

    if (opp.stage !== "discovered") {
      const { error } = await svc
        .from("opportunities")
        .update({
          stage: "discovered",
          score: null,
          score_components: null,
          analysis_id: null,
          processing_started_at: null,
          last_error: null,
        })
        .eq("id", opp.id)
        .eq("user_id", USER_ID);
      if (error) {
        console.error(`  [reset error]`, error.message);
        continue;
      }
    }

    const claimed = await claimOpportunity(svc, opp.id, USER_ID);
    if (!claimed) {
      console.log(`  [warn] could not claim`);
      continue;
    }

    try {
      const reloaded: OpportunityRow = { ...opp, stage: "discovered" };
      const { newStage, normalizedScore } = await scoreOneAccount(
        svc,
        USER_ID,
        reloaded,
        rubric,
        cfg,
      );
      console.log(`  → ${newStage} (score: ${normalizedScore})`);
    } catch (err) {
      console.error(
        `  [scoring error]`,
        err instanceof Error ? err.message : err,
      );
    } finally {
      await releaseOpportunity(svc, opp.id, USER_ID);
    }
  }

  console.log("\n[done]");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
