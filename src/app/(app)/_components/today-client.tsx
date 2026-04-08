"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";
import { triggerPipelineAction } from "../actions";
import { OpportunityCard } from "./opportunity-card";

const STAGE_LABELS: Record<OpportunityStage, string> = {
  discovered: "Discovered",
  scored: "Scored",
  filtered: "Filtered",
  researched: "Researched",
  needs_contact: "Needs Contact",
  enriched: "Enriched",
  drafted: "Drafted",
  queued: "Ready to Send",
  sending: "Sending",
  sent: "Sent",
  replied: "Replied",
  skipped: "Skipped",
};

// Badge color mapping for funnel stages
const FUNNEL_BADGE_CLASS: Record<string, string> = {
  discovered: "badge",
  scored: "badge",
  researched: "badge badge-accent",
  enriched: "badge badge-accent",
  drafted: "badge badge-accent",
  queued: "badge badge-warning",
  sent: "badge badge-success",
  replied: "badge badge-success",
};

export interface DashboardMetrics {
  replyRate: number | null;
  sentToday: number;
  dailyCap: number;
  sentThisWeek: number;
  avgScore: number | null;
  funnel: { stage: OpportunityStage; count: number }[];
}

interface TodayClientProps {
  grouped: { stage: OpportunityStage; items: OpportunityRow[] }[];
  draftsMap: Record<string, EmailDraftRow[]>;
  analysisSummaries: Record<string, string>;
  researchSummaries: Record<string, string>;
  metrics: DashboardMetrics;
}

export function TodayClient({
  grouped,
  draftsMap,
  analysisSummaries,
  researchSummaries,
  metrics,
}: TodayClientProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleRunPipeline() {
    startTransition(async () => {
      const result = await triggerPipelineAction();
      if (result.ok) {
        toast.success("Pipeline complete", {
          description: `${result.summary?.discovered ?? 0} found, ${result.summary?.scored ?? 0} scored, ${result.summary?.drafted ?? 0} drafted`,
        });
        router.refresh();
      } else {
        toast.error(result.error ?? "Pipeline failed");
      }
    });
  }

  const isEmpty = grouped.length === 0;

  return (
    <>
      <PageHeader title="Today" description="Pipeline performance at a glance.">
        <Button onClick={handleRunPipeline} disabled={isPending}>
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {isPending ? "Running…" : "Run Pipeline"}
        </Button>
      </PageHeader>

      {/* Metrics bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="surface-muted px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">Reply Rate</p>
          <p className="text-sm font-semibold">
            {metrics.replyRate != null ? `${metrics.replyRate}%` : "—"}
          </p>
        </div>
        <div className="surface-muted px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">Sent Today</p>
          <p className="text-sm font-semibold">
            {metrics.sentToday} / {metrics.dailyCap}
          </p>
        </div>
        <div className="surface-muted px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">
            Sent This Week
          </p>
          <p className="text-sm font-semibold">{metrics.sentThisWeek}</p>
        </div>
        <div className="surface-muted px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">
            Avg Score (Sent)
          </p>
          <p className="text-sm font-semibold">
            {metrics.avgScore != null ? metrics.avgScore : "—"}
          </p>
        </div>
      </div>

      {/* Pipeline funnel */}
      {metrics.funnel.length > 0 && (
        <div className="surface-muted px-3 py-2.5 mb-6">
          <p className="text-xs text-[var(--color-text-subtle)] mb-2">
            Pipeline
          </p>
          <div className="flex flex-wrap gap-2">
            {metrics.funnel.map((s) => (
              <span
                key={s.stage}
                className={FUNNEL_BADGE_CLASS[s.stage] ?? "badge"}
              >
                {STAGE_LABELS[s.stage]} {s.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {isEmpty ? (
        <EmptyState
          message="No opportunities today"
          hint="Run the pipeline to discover new roles, or check back after the daily cron."
        >
          <Button onClick={handleRunPipeline} disabled={isPending}>
            <Play size={14} />
            Run Pipeline Now
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.stage}>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                  {STAGE_LABELS[group.stage]}
                </h3>
                <span className="text-xs text-[var(--color-text-subtle)]">
                  ({group.items.length})
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opportunity={opp}
                    drafts={draftsMap[opp.id] ?? []}
                    analysisSummary={
                      opp.analysis_id
                        ? analysisSummaries[opp.analysis_id]
                        : undefined
                    }
                    researchSummary={
                      opp.research_id
                        ? researchSummaries[opp.research_id]
                        : undefined
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
