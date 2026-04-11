"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";
import { triggerPipelineAction } from "../actions";
import { OpportunityCard } from "./opportunity-card";
import { STAGE_CONFIG } from "./stage-config";

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

function sentTodayColor(sent: number, cap: number): string {
  if (cap === 0) return "";
  const ratio = sent / cap;
  if (ratio >= 1) return "text-[var(--color-success)]";
  if (ratio >= 0.7) return "text-[var(--color-warning)]";
  return "";
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="surface px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">Reply Rate</p>
          <p className="text-lg font-semibold tabular-nums">
            {metrics.replyRate != null ? (
              <>
                {metrics.replyRate}
                <span className="text-xs font-normal text-[var(--color-text-subtle)] ml-0.5">
                  %
                </span>
              </>
            ) : (
              <span className="text-[var(--color-text-subtle)]">—</span>
            )}
          </p>
        </div>
        <div className="surface px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">Sent Today</p>
          <p className="text-lg font-semibold tabular-nums">
            <span
              className={sentTodayColor(metrics.sentToday, metrics.dailyCap)}
            >
              {metrics.sentToday}
            </span>
            <span className="text-xs font-normal text-[var(--color-text-subtle)] ml-0.5">
              / {metrics.dailyCap}
            </span>
          </p>
        </div>
        <div className="surface-muted px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">
            Sent This Week
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {metrics.sentThisWeek}
          </p>
        </div>
        <div className="surface-muted px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">Avg Score</p>
          <p className="text-lg font-semibold tabular-nums">
            {metrics.avgScore != null ? (
              metrics.avgScore
            ) : (
              <span className="text-[var(--color-text-subtle)]">—</span>
            )}
          </p>
        </div>
      </div>

      {metrics.funnel.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 mb-6 px-0.5">
          <span className="text-xs font-medium text-[var(--color-text-subtle)] mr-1">
            Pipeline
          </span>
          {metrics.funnel.map((s) => (
            <Badge
              key={s.stage}
              variant={STAGE_CONFIG[s.stage]?.variant ?? "secondary"}
            >
              {STAGE_CONFIG[s.stage]?.label ?? s.stage}{" "}
              <span className="font-semibold">{s.count}</span>
            </Badge>
          ))}
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
            <section
              key={group.stage}
              aria-label={`${STAGE_CONFIG[group.stage].label} opportunities`}
            >
              <div className="flex items-baseline gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                  {STAGE_CONFIG[group.stage].label}
                </h3>
                <span className="text-xs font-semibold text-[var(--color-text-subtle)] tabular-nums">
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opportunity={opp}
                    drafts={draftsMap[opp.id] ?? []}
                    hideStageBadge
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
