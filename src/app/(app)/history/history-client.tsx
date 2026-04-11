"use client";

import { useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";
import { OpportunityCard } from "../_components/opportunity-card";
import { groupByDate } from "../_loaders/today-queue";
import { getHistoryAction } from "./actions";

const STAGE_OPTIONS: { value: OpportunityStage | ""; label: string }[] = [
  { value: "", label: "All stages" },
  { value: "discovered", label: "Discovered" },
  { value: "scored", label: "Scored" },
  { value: "researched", label: "Researched" },
  { value: "needs_contact", label: "Needs Contact" },
  { value: "enriched", label: "Enriched" },
  { value: "drafted", label: "Drafted" },
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "replied", label: "Replied" },
  { value: "skipped", label: "Skipped" },
];

function formatDateHeading(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00Z");
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function daySummary(items: OpportunityRow[]): string {
  const found = items.length;
  const sent = items.filter((o) => o.stage === "sent").length;
  const replied = items.filter((o) => o.stage === "replied").length;
  const skipped = items.filter((o) => o.stage === "skipped").length;
  const parts: string[] = [`${found} found`];
  if (sent > 0) parts.push(`${sent} emailed`);
  if (replied > 0) parts.push(`${replied} replied`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return parts.join(", ");
}

function totalOpportunities(
  grouped: { date: string; items: OpportunityRow[] }[],
): number {
  return grouped.reduce((sum, g) => sum + g.items.length, 0);
}

interface HistoryClientProps {
  initialGrouped: { date: string; items: OpportunityRow[] }[];
  initialDraftsMap: Record<string, EmailDraftRow[]>;
  initialAnalysisSummaries: Record<string, string>;
  initialResearchSummaries: Record<string, string>;
}

export function HistoryClient({
  initialGrouped,
  initialDraftsMap,
  initialAnalysisSummaries,
  initialResearchSummaries,
}: HistoryClientProps) {
  const [grouped, setGrouped] = useState(initialGrouped);
  const [draftsMap, setDraftsMap] = useState(initialDraftsMap);
  const [analysisSummaries, setAnalysisSummaries] = useState(
    initialAnalysisSummaries,
  );
  const [researchSummaries, setResearchSummaries] = useState(
    initialResearchSummaries,
  );
  const [stageFilter, setStageFilter] = useState<OpportunityStage | "">("");
  const [companySearch, setCompanySearch] = useState("");
  const [minScore, setMinScore] = useState<string>("");
  const [maxScore, setMaxScore] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  function applyFilters() {
    startTransition(async () => {
      const result = await getHistoryAction({
        stage: stageFilter || undefined,
        minScore: minScore ? parseInt(minScore, 10) : undefined,
        maxScore: maxScore ? parseInt(maxScore, 10) : undefined,
        company: companySearch || undefined,
        limit: 50,
        offset: 0,
      });

      if (result.ok) {
        setGrouped(groupByDate(result.data));
        setDraftsMap(result.draftsMap);
        setAnalysisSummaries(result.analysisSummaries);
        setResearchSummaries(result.researchSummaries);
      }
    });
  }

  const isEmpty = grouped.length === 0;
  const total = totalOpportunities(grouped);

  return (
    <>
      <PageHeader
        title="History"
        description="All pipeline opportunities across time."
      />

      {/* Filters */}
      <form
        role="search"
        aria-label="Filter opportunities"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
        className="flex flex-wrap items-end gap-3 mb-6"
      >
        <div>
          <label
            htmlFor="history-stage"
            className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
          >
            Stage
          </label>
          <select
            id="history-stage"
            className="input text-xs h-8"
            value={stageFilter}
            onChange={(e) =>
              setStageFilter(e.target.value as OpportunityStage | "")
            }
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="history-min-score"
            className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
          >
            Min Score
          </label>
          <input
            id="history-min-score"
            className="input text-xs h-8 w-20"
            type="number"
            min={0}
            max={100}
            placeholder="0"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="history-max-score"
            className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
          >
            Max Score
          </label>
          <input
            id="history-max-score"
            className="input text-xs h-8 w-20"
            type="number"
            min={0}
            max={100}
            placeholder="100"
            value={maxScore}
            onChange={(e) => setMaxScore(e.target.value)}
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label
            htmlFor="history-company"
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
              id="history-company"
              className="input text-xs h-8 pl-7"
              placeholder="Search company…"
              value={companySearch}
              onChange={(e) => setCompanySearch(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending && <Loader2 size={14} className="animate-spin" />}
          {isPending ? "Filtering…" : "Apply"}
        </Button>
      </form>

      {/* Screen reader results announcement */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {isPending
          ? "Filtering results…"
          : `Showing ${total} opportunities across ${grouped.length} days`}
      </div>

      {/* Timeline */}
      {isEmpty ? (
        <EmptyState
          message="No history yet"
          hint="Opportunities will appear here after the pipeline runs."
        />
      ) : (
        <div
          className="space-y-8"
          role="feed"
          aria-label="Opportunity timeline"
        >
          {grouped.map((group) => {
            const headingId = `date-${group.date}`;
            return (
              <section key={group.date} aria-labelledby={headingId}>
                <div className="flex items-baseline gap-2 mb-3">
                  <h3
                    id={headingId}
                    className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]"
                  >
                    {formatDateHeading(group.date)}
                  </h3>
                  <span className="text-xs text-[var(--color-text-subtle)]">
                    · {daySummary(group.items)}
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
                      showActions={false}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
