"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Play,
  Spinner,
  Plus,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { FadeIn } from "@/components/ui/fade-in";
import { EmptyState } from "@/components/empty-state";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";
import { triggerPipelineAction } from "../../actions";
import { OpportunityCard } from "./opportunity-card";
import { STAGE_CONFIG } from "./stage-config";
import {
  WINDOW_MS,
  type DashboardMetrics,
  type DiscoveredWindow,
} from "./today-helpers";
import { TodayMetricsRow } from "./today/today-metrics-row";
import { TodayFilterBar } from "./today/today-filter-bar";
import { ManualAddDialog } from "./today/manual-add-dialog";

interface TodayClientProps {
  grouped: { stage: OpportunityStage; items: OpportunityRow[] }[];
  draftsMap: Record<string, EmailDraftRow[]>;
  analysisSummaries: Record<string, string>;
  researchSummaries: Record<string, string>;
  metrics: DashboardMetrics;
  scoreThreshold: number;
}

export function TodayClient({
  grouped,
  draftsMap,
  analysisSummaries,
  researchSummaries,
  metrics,
  scoreThreshold,
}: TodayClientProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const [companySearch, setCompanySearch] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [discoveredWindow, setDiscoveredWindow] =
    useState<DiscoveredWindow>("all");
  const [injectOpen, setInjectOpen] = useState(false);

  function handleRunPipeline() {
    startTransition(async () => {
      const result = await triggerPipelineAction();
      if (result.ok) {
        toast.success("Pipeline running", {
          description: "Refresh the page in a few minutes to see new results.",
        });
        router.refresh();
      } else {
        toast.error(result.error ?? "Pipeline failed");
      }
    });
  }

  function resetFilters() {
    setCompanySearch("");
    setMinScore("");
    setMaxScore("");
    setDiscoveredWindow("all");
  }

  const filteredGrouped = useMemo(() => {
    // Bucketing window tolerates millisecond variation; the purity lint is
    // safe to relax here since deps control when this memo reruns.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const windowMs = WINDOW_MS[discoveredWindow];
    const min = minScore ? parseInt(minScore, 10) : null;
    const max = maxScore ? parseInt(maxScore, 10) : null;
    const q = companySearch.trim().toLowerCase();

    return grouped
      .map((g) => ({
        stage: g.stage,
        items: g.items.filter((o) => {
          if (q && !o.company_name.toLowerCase().includes(q)) return false;
          // Null-scored rows fail any score filter by design — if the user is
          // filtering by score, unscored rows aren't what they asked for.
          if (min != null && (o.score ?? -1) < min) return false;
          if (max != null && (o.score ?? 101) > max) return false;
          if (windowMs !== Infinity) {
            const age = now - new Date(o.discovered_at).getTime();
            if (age > windowMs) return false;
          }
          return true;
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [grouped, companySearch, minScore, maxScore, discoveredWindow]);

  const unfilteredTotal = grouped.reduce((s, g) => s + g.items.length, 0);
  const filteredTotal = filteredGrouped.reduce((s, g) => s + g.items.length, 0);
  const hasActiveFilters =
    companySearch !== "" ||
    minScore !== "" ||
    maxScore !== "" ||
    discoveredWindow !== "all";

  const isEmpty = unfilteredTotal === 0;
  const isEmptyAfterFilter = !isEmpty && filteredTotal === 0;

  return (
    <FadeIn>
      <PageHeader title="Today, at a glance">
        <Button variant="outline" onClick={() => setInjectOpen(true)}>
          <Plus size={14} />
          Add Job
        </Button>
        <Button onClick={handleRunPipeline} disabled={isPending}>
          {isPending ? (
            <Spinner size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {isPending ? "Running…" : "Run Pipeline"}
        </Button>
      </PageHeader>

      <ManualAddDialog
        open={injectOpen}
        onOpenChange={setInjectOpen}
        onScored={() => router.refresh()}
      />

      <TodayMetricsRow metrics={metrics} scoreThreshold={scoreThreshold} />

      {!isEmpty && (
        <TodayFilterBar
          companySearch={companySearch}
          onCompanySearchChange={setCompanySearch}
          minScore={minScore}
          onMinScoreChange={setMinScore}
          maxScore={maxScore}
          onMaxScoreChange={setMaxScore}
          discoveredWindow={discoveredWindow}
          onDiscoveredWindowChange={setDiscoveredWindow}
          hasActiveFilters={hasActiveFilters}
          onReset={resetFilters}
        />
      )}

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {hasActiveFilters
          ? `${filteredTotal} of ${unfilteredTotal} opportunities match filters`
          : `${unfilteredTotal} opportunities`}
      </div>

      {isEmpty ? (
        <EmptyState
          message="No opportunities ready for review"
          hint="The pipeline runs every 6 hours — check back soon, or run it manually."
        >
          <Button onClick={handleRunPipeline} disabled={isPending}>
            <Play size={14} />
            Run Pipeline Now
          </Button>
        </EmptyState>
      ) : isEmptyAfterFilter ? (
        <EmptyState
          message="No opportunities match these filters"
          hint="Try widening the score range, extending the discovered window, or clearing the company search."
        >
          <Button variant="outline" onClick={resetFilters}>
            Clear filters
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {filteredGrouped.map((group) => (
            <section
              key={group.stage}
              aria-label={`${STAGE_CONFIG[group.stage].label} opportunities`}
            >
              <div className="flex items-baseline gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
                  {STAGE_CONFIG[group.stage].label}
                </h3>
                <span className="text-xs tabular-nums text-[var(--color-text-subtle)]">
                  {group.items.length}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opportunity={opp}
                    drafts={draftsMap[opp.id] ?? []}
                    scoreThreshold={scoreThreshold}
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
    </FadeIn>
  );
}
