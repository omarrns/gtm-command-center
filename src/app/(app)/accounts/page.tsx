import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type {
  OpportunityRow,
  OpportunitySource,
  OpportunityStage,
} from "@/lib/supabase/types";
import { icpAccountAnalysisSchema } from "@/lib/pipeline/scoring-account";
import { SKIPPABLE_STAGES } from "@/lib/pipeline/stages";
import { createLogger } from "@/lib/logger";
import { AccountCard } from "../_components/account-card";
import { FadeIn } from "@/components/ui/fade-in";

// GTM-only queue of accounts the pipeline promoted for the user. Rows
// stay here across downstream stage transitions (scored → researched →
// needs_contact, etc.) and only leave when the user explicitly dismisses
// them (stage='skipped' via skipOpportunityAction / flagCompanyAction).
// Pure read from persisted pipeline output — no live API calls, no
// scoring, no watchlist side effects here. Those are owned by
// /api/cron/pipeline, /api/cron/dormant-discover, and
// /api/webhooks/theirstack.

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

  // Show every account the pipeline promoted, regardless of downstream
  // pursuit outcome. Exclude only: discovered (not yet scored), filtered
  // (below threshold — never belonged here), and skipped (explicit user
  // dismissal). See feedback_accounts_never_auto_remove.md.
  const { data: oppsRaw, error: oppsError } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", user.id)
    .in("source", ["theirstack", "exa-dormant"])
    .not("stage", "in", "(discovered,filtered,skipped)")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(50);

  if (oppsError) {
    const log = createLogger({ scope: "accounts.page", userId: user.id });
    log.error("opportunities query failed", oppsError);
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
        <PageHeader
          title="Accounts"
          description="Accounts the pipeline promoted from TheirStack + Exa dormant."
        />
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load accounts</AlertTitle>
          <AlertDescription>
            Refresh the page or try again shortly. The error has been logged.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const opps = (oppsRaw ?? []) as OpportunityRow[];

  // Batch-load analyses so we can surface reason_to_believe on each card.
  // The opportunity row carries score + tier + verdict via
  // score_components, but the one-line AE hook lives on analyses.result.
  const analysisIds = opps
    .map((o) => o.analysis_id)
    .filter((id): id is string => !!id);

  const reasonById = new Map<string, string>();
  if (analysisIds.length > 0) {
    const { data: analyses, error: analysesError } = await svc
      .from("analyses")
      .select("id, result")
      .in("id", analysisIds);

    if (analysesError) {
      // Soft degradation: cards render without reason_to_believe. Don't
      // block the page — the main opportunity payload already passed.
      const log = createLogger({ scope: "accounts.page", userId: user.id });
      log.error(
        "analyses lookup failed; rendering without reasons",
        analysesError,
      );
    }

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
          description="Accounts the pipeline promoted from TheirStack + Exa dormant. Stay here until you skip."
        />
        <EmptyState
          message="No promoted accounts yet"
          hint="The main pipeline runs every 6 hours; the dormant sweep runs Monday 12:00 UTC. Accounts scoring above your threshold land here and stay until you dismiss them."
        />
      </div>
    );
  }

  return (
    <FadeIn className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <PageHeader
        title="Accounts"
        description={`${opps.length} promoted ${opps.length === 1 ? "account" : "accounts"}, highest-scoring first.`}
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
              opportunityId={o.id}
              canSkip={SKIPPABLE_STAGES.includes(o.stage as OpportunityStage)}
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
