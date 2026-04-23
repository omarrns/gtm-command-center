import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import type { OpportunityRow, OpportunitySource } from "@/lib/supabase/types";
import { icpAccountAnalysisSchema } from "@/lib/pipeline/scoring-account";
import { AccountCard } from "../_components/account-card";
import { FadeIn } from "@/components/ui/fade-in";

// GTM-only queue of scored accounts. Pure read from persisted pipeline
// output — no live API calls, no scoring, no watchlist side effects
// here. Those are owned by /api/cron/pipeline, /api/cron/dormant-discover,
// and /api/webhooks/theirstack. This surface is just "show me what the
// pipeline produced since I last looked."

export default async function AccountsPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();

  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.user_type !== "gtm") {
    redirect("/");
  }

  const { data: oppsRaw } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", user.id)
    .in("source", ["theirstack", "exa-dormant"])
    .eq("stage", "scored")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(50);

  const opps = (oppsRaw ?? []) as OpportunityRow[];

  // Batch-load analyses so we can surface reason_to_believe on each card.
  // The opportunity row carries score + tier + verdict via
  // score_components, but the one-line AE hook lives on analyses.result.
  const analysisIds = opps
    .map((o) => o.analysis_id)
    .filter((id): id is string => !!id);

  const reasonById = new Map<string, string>();
  if (analysisIds.length > 0) {
    const { data: analyses } = await svc
      .from("analyses")
      .select("id, result")
      .in("id", analysisIds);

    for (const a of analyses ?? []) {
      const parsed = icpAccountAnalysisSchema.safeParse(a.result);
      if (parsed.success) {
        reasonById.set(a.id as string, parsed.data.reason_to_believe);
      }
    }
  }

  if (opps.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
        <PageHeader
          title="Accounts"
          description="Tier-scored accounts from the TheirStack + Exa dormant pipelines."
        />
        <EmptyState
          message="No scored accounts yet"
          hint="The main pipeline runs every 6 hours; the dormant sweep runs Monday 12:00 UTC. Fresh Tier-A picks will land here as they score above your threshold."
        />
      </div>
    );
  }

  return (
    <FadeIn className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <PageHeader
        title="Accounts"
        description={`${opps.length} scored ${opps.length === 1 ? "account" : "accounts"} above your threshold, freshest first.`}
      />
      <div className="space-y-2">
        {opps.map((o) => {
          const triggers = (o.trigger_signals ?? [])[0] as
            | Record<string, unknown>
            | undefined;
          const components = (o.score_components ?? {}) as Record<
            string,
            unknown
          >;

          const tier =
            typeof components.tier === "string" &&
            ["A", "B", "C"].includes(components.tier)
              ? (components.tier as "A" | "B" | "C")
              : "C";
          const verdict =
            components.verdict === "Pursue" ||
            components.verdict === "Worth exploring" ||
            components.verdict === "Skip"
              ? components.verdict
              : "Worth exploring";

          const reason = o.analysis_id
            ? (reasonById.get(o.analysis_id) ?? "")
            : "";

          return (
            <AccountCard
              key={o.id}
              companyName={o.company_name}
              companyDomain={o.company_domain}
              roleTitle={o.role_title}
              score={o.score ?? 0}
              tier={tier}
              verdict={verdict}
              reasonToBelieve={reason}
              fundingStage={
                typeof triggers?.funding_stage === "string"
                  ? triggers.funding_stage
                  : null
              }
              employeeCount={
                typeof triggers?.employee_count === "number"
                  ? triggers.employee_count
                  : null
              }
              industry={
                typeof triggers?.industry === "string"
                  ? triggers.industry
                  : null
              }
              discoveredAt={o.discovered_at}
              source={
                o.source as Extract<
                  OpportunitySource,
                  "theirstack" | "exa-dormant"
                >
              }
            />
          );
        })}
      </div>
    </FadeIn>
  );
}
