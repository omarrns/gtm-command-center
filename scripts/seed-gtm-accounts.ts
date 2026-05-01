/**
 * Seed enriched GTM account fixtures for story-grounded outreach testing.
 *
 * Usage: npx tsx scripts/seed-gtm-accounts.ts
 *
 * Uses source="theirstack" so /accounts surfaces the rows without a migration.
 * Existing fixture drafts are cleared so repeated runs reset selected_draft_id.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolveSeedUserTarget } from "./lib/user-target";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FIXTURES = [
  {
    external_id: "gtm-story-fixture-email-match",
    company_name: "Northstar Revenue",
    company_domain: "northstar-revenue.example",
    recipient_name: "Maya Chen",
    recipient_title: "VP Revenue Operations",
    recipient_email: "maya.chen@northstar-revenue.example",
    role_title: "RevOps Systems Lead",
    trigger_signals: [
      {
        type: "hiring",
        description: "Hiring RevOps systems roles while pipeline quality slips.",
        employee_count: 180,
        funding_stage: "Series B",
        industry: "Revenue intelligence",
      },
    ],
    buyer_personas: [
      {
        name: "Maya Chen",
        title: "VP Revenue Operations",
        email: "maya.chen@northstar-revenue.example",
        description: "Owns GTM systems and board-visible pipeline reporting.",
      },
    ],
  },
  {
    external_id: "gtm-story-fixture-name-match",
    company_name: "LedgerPilot",
    company_domain: "ledgerpilot.example",
    recipient_name: "Andre Wallace",
    recipient_title: "Head of Growth",
    recipient_email: "andre.wallace@ledgerpilot.example",
    role_title: "Lifecycle Marketing Manager",
    trigger_signals: [
      {
        type: "growth-stage",
        description: "Expanding into mid-market with a lean growth team.",
        employee_count: 95,
        funding_stage: "Series A",
        industry: "Fintech",
      },
    ],
    buyer_personas: [
      {
        name: "Andre Wallace",
        title: "Head of Growth",
        description: "Needs a repeatable account motion without adding headcount.",
      },
    ],
  },
  {
    external_id: "gtm-story-fixture-recipient-fallback",
    company_name: "Aperture Labs",
    company_domain: "aperture-labs.example",
    recipient_name: "Priya Shah",
    recipient_title: "Founder",
    recipient_email: "priya.shah@aperture-labs.example",
    role_title: null,
    trigger_signals: [
      {
        type: "founder-led-gtm",
        description: "Founder-led sales is stretching past manual research.",
        employee_count: 28,
        funding_stage: "Seed",
        industry: "AI infrastructure",
      },
    ],
    buyer_personas: [],
  },
];

async function main() {
  const { userId, email } = await resolveSeedUserTarget(supabase);

  const { data: existing, error: existingError } = await supabase
    .from("opportunities")
    .select("id")
    .eq("user_id", userId)
    .eq("source", "theirstack")
    .in(
      "external_id",
      FIXTURES.map((fixture) => fixture.external_id),
    );
  if (existingError) throw existingError;

  const existingIds = (existing ?? []).map((row) => row.id as string);
  if (existingIds.length > 0) {
    const { error: clearPointerError } = await supabase
      .from("opportunities")
      .update({ selected_draft_id: null })
      .eq("user_id", userId)
      .in("id", existingIds);
    if (clearPointerError) throw clearPointerError;

    const { error: deleteDraftsError } = await supabase
      .from("email_drafts")
      .delete()
      .eq("user_id", userId)
      .in("opportunity_id", existingIds);
    if (deleteDraftsError) throw deleteDraftsError;
  }

  for (const fixture of FIXTURES) {
    const { data, error } = await supabase
      .from("opportunities")
      .upsert(
        {
          user_id: userId,
          source: "theirstack",
          stage: "enriched",
          score: 75,
          score_components: { tier: "A", verdict: "Pursue" },
          selected_draft_id: null,
          last_error: null,
          ...fixture,
        },
        { onConflict: "user_id,source,external_id" },
      )
      .select("id, company_name")
      .single();
    if (error) throw error;
    console.log(`✓ Seeded ${data.company_name} for ${email}: ${data.id}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
