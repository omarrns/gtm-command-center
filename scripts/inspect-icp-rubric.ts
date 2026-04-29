/**
 * One-shot diagnostic: fetch a user's icp_rubric and report canonical
 * vs non-canonical enum values per affected sub-dimension. Used to
 * verify Phase 9's prompt fix produced clean snake_case keys for new
 * onboarding runs.
 *
 * Usage: tsx scripts/inspect-icp-rubric.ts <email>
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { ICP_ENUMS } from "../src/lib/onboarding/icp-enums";
import { safeParseIcpRubric } from "../src/lib/onboarding/icp-schemas";

const email = process.argv[2];
if (!email) {
  console.error("Usage: tsx scripts/inspect-icp-rubric.ts <email>");
  process.exit(1);
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing supabase env");
  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersPage, error: usersErr } = await svc.auth.admin.listUsers({
    perPage: 1000,
  });
  if (usersErr) throw usersErr;
  const user = usersPage.users.find((u) => u.email === email);
  if (!user) {
    console.error(`No auth user with email ${email}`);
    process.exit(1);
  }

  const { data: profile, error: profileErr } = await svc
    .from("user_scoring_profiles")
    .select("icp_rubric, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile?.icp_rubric) {
    console.error(`No icp_rubric for user ${email}`);
    process.exit(1);
  }

  const parsed = safeParseIcpRubric(profile.icp_rubric);
  if (!parsed.success) {
    console.error("icp_rubric failed schema validation:", parsed.error.message);
    process.exit(1);
  }
  const rubric = parsed.data;

  console.log(`\nuser:   ${email}`);
  console.log(`rubric updated: ${profile.updated_at}\n`);

  const checks: Array<{
    label: string;
    actual: readonly string[];
    canonical: readonly string[];
  }> = [
    {
      label: "product.delivery_model",
      actual: rubric.product.delivery_model
        ? [rubric.product.delivery_model]
        : [],
      canonical: ICP_ENUMS.deliveryModelValues,
    },
    {
      label: "firmographics.business_model",
      actual: rubric.firmographics.business_model
        ? [rubric.firmographics.business_model]
        : [],
      canonical: ICP_ENUMS.businessModelValues,
    },
    {
      label: "firmographics.stages",
      actual: rubric.firmographics.stages,
      canonical: ICP_ENUMS.stageValues,
    },
    {
      label: "firmographics.geographies",
      actual: rubric.firmographics.geographies,
      canonical: ICP_ENUMS.geographyValues,
    },
    {
      label: "technographics.tech_maturity",
      actual: rubric.technographics.tech_maturity
        ? [rubric.technographics.tech_maturity]
        : [],
      canonical: ICP_ENUMS.techMaturityValues,
    },
    {
      label: "technographics.data_infrastructure",
      actual: rubric.technographics.data_infrastructure
        ? [rubric.technographics.data_infrastructure]
        : [],
      canonical: ICP_ENUMS.dataInfrastructureValues,
    },
    {
      label: "disqualifiers.stage_disqualifiers",
      actual: rubric.disqualifiers.stage_disqualifiers,
      canonical: ICP_ENUMS.stageValues,
    },
  ];

  let cleanCount = 0;
  let driftCount = 0;
  let emptyCount = 0;

  for (const check of checks) {
    if (check.actual.length === 0) {
      console.log(`  ·  ${check.label}: (empty)`);
      emptyCount++;
      continue;
    }
    const drift = check.actual.filter(
      (v) => !check.canonical.includes(v as never),
    );
    if (drift.length === 0) {
      console.log(`  ✓  ${check.label}: ${check.actual.join(", ")}`);
      cleanCount++;
    } else {
      console.log(`  ✗  ${check.label}: ${check.actual.join(", ")}`);
      console.log(`     drift: ${drift.join(", ")}`);
      driftCount++;
    }
  }

  console.log(
    `\nclean: ${cleanCount}  drift: ${driftCount}  empty: ${emptyCount}`,
  );
  if (driftCount === 0 && cleanCount > 0) {
    console.log(
      "Phase 9 prompt fix verified — every populated enum sub-dim uses canonical keys.",
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
