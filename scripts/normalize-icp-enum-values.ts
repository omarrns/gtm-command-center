/**
 * One-shot cleanup for `user_scoring_profiles.icp_rubric` enum values
 * stored in human-text form before Phase 9.
 *
 * Phase 9 (commit 84f45b6) gave the orchestrator + extractor the canonical
 * enum vocabulary, so future runs emit stable snake_case keys
 * ("united_states", "series_a", "saas"). Rubrics saved before that fix
 * carry human-text variants ("United States", "Series A", "SaaS") and
 * surface as warning chips ("Stored as 'United States' — not in the
 * canonical option list") in the dashboard EnumSelect / EditableField.
 *
 * This script walks the affected enum sub-dimensions and remaps known
 * variants to canonical keys. Anything that doesn't match a synonym is
 * left as-is so the warning chip remains visible — the cleanup is
 * intentionally conservative.
 *
 * Usage:
 *   pnpm normalize:icp-enums          # dry-run, prints planned changes
 *   pnpm normalize:icp-enums --apply  # writes back to Supabase
 *
 * Single-tenant tool: hardcodes USER_ID like rescore-theirstack.ts. If
 * the codebase ever goes multi-tenant, swap the lookup for an iteration
 * over `profiles.user_type='gtm'`.
 *
 * Removable. Once existing rubrics are normalized this script has done
 * its job; nothing in the runtime path depends on it.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { parseIcpRubric } from "@/lib/onboarding/icp-schemas";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";

const USER_ID = "7217874b-9288-41af-bb39-c53920a47da6";

// Sub-dim → synonym map. Keys are lowercased for case-insensitive
// matching; values are the canonical snake_case keys that match the
// enum lists in src/lib/onboarding/icp-enums/. Anything not listed
// here passes through unchanged (and keeps its warning chip).
const SYNONYMS: Record<string, Record<string, string>> = {
  "firmographics.geographies": {
    "united states": "united_states",
    "united states of america": "united_states",
    usa: "united_states",
    us: "united_states",
    america: "united_states",
    "north america": "united_states", // best-fit; refine manually if EU+US
    canada: "canada",
    ca: "canada",
    "united kingdom": "united_kingdom",
    uk: "united_kingdom",
    britain: "united_kingdom",
    england: "united_kingdom",
    europe: "europe",
    eu: "europe",
    emea: "europe", // best-fit; geography enum has no separate EMEA
    "latin america": "latin_america",
    latam: "latin_america",
    "middle east": "middle_east",
    india: "india",
    apac: "apac",
    "asia pacific": "apac",
    "asia-pacific": "apac",
    asia: "apac",
    global: "global",
    worldwide: "global",
    international: "global",
  },
  "firmographics.stages": {
    "pre-seed": "pre_seed",
    preseed: "pre_seed",
    "pre seed": "pre_seed",
    seed: "seed",
    "series a": "series_a",
    "series-a": "series_a",
    "series b": "series_b",
    "series-b": "series_b",
    "series c": "series_c",
    "series-c": "series_c",
    "series d": "series_d_plus",
    "series-d": "series_d_plus",
    "series d+": "series_d_plus",
    "series e": "series_d_plus",
    "series f": "series_d_plus",
    growth: "series_d_plus",
    late: "series_d_plus",
    "late stage": "series_d_plus",
    public: "public",
    ipo: "public",
    "publicly traded": "public",
    bootstrapped: "bootstrapped",
    bootstrap: "bootstrapped",
  },
  "firmographics.business_model": {
    saas: "saas",
    "b2b saas": "saas",
    "software as a service": "saas",
    transactional: "transactional",
    marketplace: "marketplace",
    subscription: "subscription",
    "usage-based": "usage_based",
    usage: "usage_based",
    "pay as you go": "usage_based",
    services: "services",
    consulting: "services",
    advertising: "advertising",
    "ad-supported": "advertising",
    "enterprise license": "enterprise_license",
    enterprise: "enterprise_license",
    license: "enterprise_license",
  },
  "product.delivery_model": {
    saas: "saas",
    "b2b saas": "saas",
    api: "api",
    "api-first": "api",
    "managed service": "managed_service",
    managed: "managed_service",
    marketplace: "marketplace",
    "open source": "open_source",
    "open-source": "open_source",
    oss: "open_source",
    hardware: "hardware",
  },
  "technographics.tech_maturity": {
    low: "low",
    laggard: "low",
    moderate: "moderate",
    medium: "moderate",
    average: "moderate",
    high: "high",
    advanced: "high",
    "cloud native": "cloud_native",
    "cloud-native": "cloud_native",
    "ai native": "ai_native",
    "ai-native": "ai_native",
    "ai-first": "ai_native",
  },
  "technographics.data_infrastructure": {
    none: "none",
    spreadsheets: "spreadsheets",
    excel: "spreadsheets",
    sheets: "spreadsheets",
    warehouse: "warehouse",
    "data warehouse": "warehouse",
    snowflake: "warehouse",
    bigquery: "warehouse",
    "modern data stack": "modern_data_stack",
    mds: "modern_data_stack",
    dbt: "modern_data_stack",
    "realtime streaming": "realtime_streaming",
    "real-time streaming": "realtime_streaming",
    streaming: "realtime_streaming",
    kafka: "realtime_streaming",
    "ml platform": "ml_platform",
    ml: "ml_platform",
    mlops: "ml_platform",
  },
  // disqualifiers.stage_disqualifiers reuses the stages enum, so the
  // same synonym table applies. Aliased rather than duplicated below
  // in `normalizeRubric`.
};

interface Change {
  path: string;
  from: string;
  to: string;
}

function normalizeOne(path: string, value: string, changes: Change[]): string {
  const table = SYNONYMS[path];
  if (!table) return value;
  const mapped = table[value.trim().toLowerCase()];
  if (!mapped || mapped === value) return value;
  changes.push({ path, from: value, to: mapped });
  return mapped;
}

function normalizeArray(
  path: string,
  values: string[],
  changes: Change[],
): string[] {
  // Map → de-dup (two variants can collapse to the same canonical key).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const next = normalizeOne(path, v, changes);
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
  }
  return out;
}

function normalizeRubric(rubric: IcpRubric): {
  rubric: IcpRubric;
  changes: Change[];
} {
  const changes: Change[] = [];
  const next: IcpRubric = {
    ...rubric,
    product: {
      ...rubric.product,
      delivery_model: normalizeOne(
        "product.delivery_model",
        rubric.product.delivery_model,
        changes,
      ),
    },
    firmographics: {
      ...rubric.firmographics,
      business_model: normalizeOne(
        "firmographics.business_model",
        rubric.firmographics.business_model,
        changes,
      ),
      stages: normalizeArray(
        "firmographics.stages",
        rubric.firmographics.stages,
        changes,
      ),
      geographies: normalizeArray(
        "firmographics.geographies",
        rubric.firmographics.geographies,
        changes,
      ),
    },
    technographics: {
      ...rubric.technographics,
      tech_maturity: normalizeOne(
        "technographics.tech_maturity",
        rubric.technographics.tech_maturity,
        changes,
      ),
      data_infrastructure: normalizeOne(
        "technographics.data_infrastructure",
        rubric.technographics.data_infrastructure,
        changes,
      ),
    },
    disqualifiers: {
      ...rubric.disqualifiers,
      // stage_disqualifiers reuses the stages vocabulary
      stage_disqualifiers: normalizeArray(
        "firmographics.stages",
        rubric.disqualifiers.stage_disqualifiers,
        changes,
      ),
    },
  };
  return { rubric: next, changes };
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing supabase env");
  const svc = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await svc
    .from("user_scoring_profiles")
    .select("icp_rubric")
    .eq("user_id", USER_ID)
    .maybeSingle();

  if (error) throw error;
  if (!data?.icp_rubric) {
    console.log("[normalize] no icp_rubric for user; nothing to do");
    return;
  }

  const rubric = parseIcpRubric(data.icp_rubric);
  const { rubric: nextRubric, changes } = normalizeRubric(rubric);

  if (changes.length === 0) {
    console.log("[normalize] rubric already canonical — no changes");
    return;
  }

  console.log(
    `[normalize] ${changes.length} value${changes.length === 1 ? "" : "s"} to normalize:\n`,
  );
  for (const c of changes) {
    console.log(`  ${c.path}: "${c.from}" → "${c.to}"`);
  }

  if (!apply) {
    console.log(
      `\n[normalize] dry-run. Re-run with --apply to write the changes.`,
    );
    return;
  }

  const { error: writeErr } = await svc
    .from("user_scoring_profiles")
    .upsert(
      { user_id: USER_ID, icp_rubric: nextRubric },
      { onConflict: "user_id" },
    );

  if (writeErr) {
    console.error("[normalize] write failed:", writeErr.message);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n[normalize] applied ${changes.length} change${changes.length === 1 ? "" : "s"} to user_scoring_profiles.icp_rubric`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
