"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { MOCK_CALLS } from "@/lib/calls/data";
import { CallDetailModal } from "./call-detail-modal";
import type { SalesCall, CallStage, CallOutcome } from "@/lib/calls/types";
import { cn } from "@/lib/utils";

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  ongoing: "Ongoing",
  won: "Won",
  lost: "Lost",
};

const STAGES: CallStage[] = [
  "Renewal",
  "Closed Won",
  "Technical Evaluation",
  "Demo",
];

const OUTCOMES: CallOutcome[] = ["ongoing", "won", "lost"];

function stageBadgeVariant(stage: CallStage) {
  if (stage === "Closed Won") return "success" as const;
  if (stage === "Technical Evaluation") return "accent" as const;
  return "muted" as const;
}

function outcomeBadgeVariant(outcome: CallOutcome) {
  if (outcome === "won") return "success" as const;
  if (outcome === "lost") return "destructive" as const;
  return "secondary" as const;
}

function CountCell({ count }: { count: number }) {
  return (
    <span
      className={cn(
        "text-sm tabular-nums",
        count === 0
          ? "text-[var(--color-text-subtle)]"
          : "text-[var(--color-text)]",
      )}
    >
      {count}
    </span>
  );
}

export function CallsClient() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<CallStage | "">("");
  const [outcomeFilter, setOutcomeFilter] = useState<CallOutcome | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return MOCK_CALLS.filter((c) => {
      const matchSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.account.toLowerCase().includes(search.toLowerCase()) ||
        c.rep.toLowerCase().includes(search.toLowerCase());
      const matchStage = !stageFilter || c.stage === stageFilter;
      const matchOutcome = !outcomeFilter || c.outcome === outcomeFilter;
      return matchSearch && matchStage && matchOutcome;
    });
  }, [search, stageFilter, outcomeFilter]);

  const selectedIndex = filtered.findIndex((c) => c.id === selectedId);
  const selectedCall = selectedIndex !== -1 ? filtered[selectedIndex] : null;

  function navigate(delta: number) {
    const next = filtered[selectedIndex + delta];
    if (next) setSelectedId(next.id);
  }

  return (
    <>
      <PageHeader
        title="Calls"
        description="AI analysis of your team's sales calls — objections, pain points, and coaching notes."
      />

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
          />
          <Input
            placeholder="Search calls, accounts, reps…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as CallStage | "")}
          className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
        >
          <option value="">All Stages</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={outcomeFilter}
          onChange={(e) => setOutcomeFilter(e.target.value as CallOutcome | "")}
          className="h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue)]"
        >
          <option value="">All Outcomes</option>
          {OUTCOMES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-[var(--color-text-muted)] mb-3">
        Showing {filtered.length} of {MOCK_CALLS.length} calls
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
              {(
                [
                  ["Call", "text-left w-[35%]"],
                  ["Rep", "text-left"],
                  ["Account", "text-left"],
                  ["Stage", "text-left"],
                  ["Amount", "text-right"],
                  ["Date", "text-left"],
                  ["Obj.", "text-center w-12"],
                  ["Pain", "text-center w-12"],
                  ["Flags", "text-center w-12"],
                  ["Outcome", "text-left"],
                ] as [string, string][]
              ).map(([label, cls]) => (
                <th
                  key={label}
                  className={cn(
                    "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]",
                    cls,
                  )}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((call, i) => (
              <CallRow
                key={call.id}
                call={call}
                isLast={i === filtered.length - 1}
                onClick={() => setSelectedId(call.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-10 text-center text-sm text-[var(--color-text-muted)]"
                >
                  No calls match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedCall && (
        <CallDetailModal
          call={selectedCall}
          callIndex={selectedIndex}
          totalCalls={filtered.length}
          onClose={() => setSelectedId(null)}
          onPrev={() => navigate(-1)}
          onNext={() => navigate(1)}
        />
      )}
    </>
  );
}

function CallRow({
  call,
  isLast,
  onClick,
}: {
  call: SalesCall;
  isLast: boolean;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "cursor-pointer transition-colors duration-100 hover:bg-[var(--color-surface-muted)]",
        !isLast && "border-b border-[var(--color-border)]",
      )}
    >
      <td className="px-4 py-3">
        <p className="font-medium text-[var(--color-text)] leading-snug">
          {call.title}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {call.duration}
        </p>
      </td>
      <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap">
        {call.rep}
      </td>
      <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap">
        {call.account}
      </td>
      <td className="px-4 py-3">
        <Badge variant={stageBadgeVariant(call.stage)}>{call.stage}</Badge>
      </td>
      <td className="px-4 py-3 text-right text-[var(--color-text-muted)] whitespace-nowrap tabular-nums">
        ${call.amount.toLocaleString()}
      </td>
      <td className="px-4 py-3 text-[var(--color-text-muted)] whitespace-nowrap">
        {new Date(call.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
      <td className="px-4 py-3 text-center">
        <CountCell count={call.objectionCount} />
      </td>
      <td className="px-4 py-3 text-center">
        <CountCell count={call.painPointCount} />
      </td>
      <td className="px-4 py-3 text-center">
        <CountCell count={call.redFlagCount} />
      </td>
      <td className="px-4 py-3">
        <Badge variant={outcomeBadgeVariant(call.outcome)}>
          {OUTCOME_LABEL[call.outcome]}
        </Badge>
      </td>
    </tr>
  );
}
