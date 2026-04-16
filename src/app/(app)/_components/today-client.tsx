"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";
import {
  triggerPipelineAction,
  manualInjectOpportunityAction,
} from "../actions";
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
  scoreThreshold: number;
}

type DiscoveredWindow = "all" | "today" | "3d" | "7d";

const WINDOW_MS: Record<DiscoveredWindow, number> = {
  all: Infinity,
  today: 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const WINDOW_OPTIONS: { value: DiscoveredWindow; label: string }[] = [
  { value: "all", label: "All" },
  { value: "today", label: "Today" },
  { value: "3d", label: "3d" },
  { value: "7d", label: "7d" },
];

function sentTodayColor(sent: number, cap: number): string {
  if (cap === 0) return "";
  const ratio = sent / cap;
  if (ratio >= 1) return "text-[var(--color-success)]";
  if (ratio >= 0.7) return "text-[var(--color-warning)]";
  // Nothing sent yet — mute the zero so it doesn't read as a positive signal
  if (sent === 0) return "text-[var(--color-text-muted)]";
  return "";
}

function scoreAvgColor(avg: number, threshold: number): string {
  if (avg >= 80) return "text-[var(--color-success)]";
  if (avg >= threshold) return "text-[var(--color-blue)]";
  return "";
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
  const [injectPending, startInjectTransition] = useTransition();
  const [jobUrl, setJobUrl] = useState("");

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

  function handleInjectSubmit() {
    startInjectTransition(async () => {
      const result = await manualInjectOpportunityAction(jobUrl);
      if (result.ok) {
        toast.success(
          `Scored ${result.score}/100 — ${result.stage === "scored" ? "passed threshold" : "filtered out"}`,
          { description: `${result.companyName} · ${result.roleTitle}` },
        );
        setJobUrl("");
        setInjectOpen(false);
        router.refresh();
      } else {
        toast.error(result.error ?? "Failed to score job");
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
    <>
      <PageHeader title="Today" description="Pipeline performance at a glance.">
        <Button
          variant="outline"
          onClick={() => setInjectOpen(true)}
          disabled={injectPending}
        >
          <Plus size={14} />
          Add Job
        </Button>
        <Button onClick={handleRunPipeline} disabled={isPending}>
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {isPending ? "Running…" : "Run Pipeline"}
        </Button>
      </PageHeader>

      <Dialog open={injectOpen} onOpenChange={setInjectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Job to Pipeline</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <input
              className="input w-full text-sm"
              type="url"
              value={jobUrl}
              onChange={(e) => setJobUrl(e.target.value)}
              placeholder="https://..."
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInjectOpen(false)}
              disabled={injectPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleInjectSubmit}
              disabled={injectPending || !jobUrl.trim()}
            >
              {injectPending && <Loader2 size={14} className="animate-spin" />}
              {injectPending ? "Scoring…" : "Score & Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <span className={scoreAvgColor(metrics.avgScore, scoreThreshold)}>
                {metrics.avgScore}
              </span>
            ) : (
              <span className="text-[var(--color-text-subtle)]">—</span>
            )}
          </p>
        </div>
      </div>

      {metrics.funnel.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 mb-3 px-0.5">
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

      {!isEmpty && (
        <div className="flex flex-wrap items-end gap-2 mb-5">
          <div>
            <span
              id="today-discovered-label"
              className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
            >
              Discovered
            </span>
            <div
              role="group"
              aria-labelledby="today-discovered-label"
              className="inline-flex rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-0.5"
            >
              {WINDOW_OPTIONS.map((opt) => {
                const active = discoveredWindow === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDiscoveredWindow(opt.value)}
                    className={cn(
                      "px-2.5 h-7 text-xs font-medium rounded-md transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-1",
                      active
                        ? "bg-[var(--color-blue-muted)] text-[var(--color-blue)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="today-min-score"
              className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
            >
              Min Score
            </label>
            <input
              id="today-min-score"
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              placeholder="0"
              className="input text-xs h-8 w-16 tabular-nums"
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="today-max-score"
              className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
            >
              Max Score
            </label>
            <input
              id="today-max-score"
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              placeholder="100"
              className="input text-xs h-8 w-16 tabular-nums"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>

          <div className="flex-1 min-w-[180px]">
            <label
              htmlFor="today-company"
              className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
            >
              Company
            </label>
            <div className="relative">
              <Search
                size={13}
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
              />
              <input
                id="today-company"
                type="search"
                placeholder="Search company…"
                className="input text-xs h-8 pl-7"
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="h-8 px-2.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-1 rounded-md"
            >
              Clear
            </button>
          )}
        </div>
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
                <h3
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wider",
                    group.stage === "queued"
                      ? "text-[var(--color-blue)]"
                      : "text-[var(--color-text-subtle)]",
                  )}
                >
                  {STAGE_CONFIG[group.stage].label}
                </h3>
                <span className="text-xs font-semibold tabular-nums text-[var(--color-text-subtle)]">
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
    </>
  );
}
