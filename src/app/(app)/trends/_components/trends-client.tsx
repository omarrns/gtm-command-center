"use client";

import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import {
  ALL_CALLS,
  REP_STATS,
  COMPETITOR_MENTIONS,
  OBJ_BY_MONTH,
  LOSS_REASONS,
  CALLS_BY_COMPETITOR,
  callsForRep,
  callsForObjType,
  callsForLoss,
  type RepStat,
  type CompetitorMention,
  type ObjPatternMonth,
  type LossReason,
} from "@/lib/trends/data";
import { TrendsSourceModal } from "./trends-source-modal";
import type { SalesCall } from "@/lib/calls/types";

interface ModalState {
  title: string;
  calls: SalesCall[];
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-10">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          {title}
        </h2>
        {description && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {description}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function HBar({
  value,
  max,
  label,
  count,
  onClick,
}: {
  value: number;
  max: number;
  label?: string;
  count: number;
  onClick?: () => void;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        onClick &&
          "cursor-pointer hover:opacity-75 transition-opacity duration-100",
      )}
      onClick={onClick}
    >
      {label && (
        <span className="text-xs text-[var(--color-text-muted)] w-32 shrink-0 truncate">
          {label}
        </span>
      )}
      <div className="flex-1 h-1.5 bg-[var(--color-surface-muted)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--color-blue)] rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-[var(--color-text-muted)] w-4 text-right">
        {count}
      </span>
    </div>
  );
}

function GradeBadge({ grade }: { grade: RepStat["grade"] }) {
  if (grade === "A")
    return (
      <Badge className="bg-[var(--color-success)] text-white border-[var(--color-success)]">
        A
      </Badge>
    );
  if (grade === "C")
    return (
      <Badge className="bg-[var(--color-warning)] text-white border-[var(--color-warning)]">
        C
      </Badge>
    );
  if (grade === "D")
    return (
      <Badge className="bg-[var(--color-danger)] text-white border-[var(--color-danger)]">
        D
      </Badge>
    );
  return <Badge variant="outline">B</Badge>;
}

// ─── Section components ───────────────────────────────────────────────────────

function RepTable({
  stats,
  onRowClick,
}: {
  stats: RepStat[];
  onRowClick: (name: string) => void;
}) {
  return (
    <TableWrap>
      <thead>
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
          <Th className="text-left w-[32%]">Rep</Th>
          <Th className="text-center w-[10%]">Score</Th>
          <Th className="text-center w-[8%]">Grade</Th>
          <Th className="text-center w-[10%]">Calls</Th>
          <Th className="text-center w-[10%]">Wins</Th>
          <Th className="text-center w-[10%]">Losses</Th>
          <Th className="text-left w-[20%]">Avg Obj. Response</Th>
        </tr>
      </thead>
      <tbody>
        {stats.map((rep, i) => (
          <tr
            key={rep.name}
            onClick={() => onRowClick(rep.name)}
            className={cn(
              "cursor-pointer hover:bg-[var(--color-surface-muted)] transition-colors duration-100",
              "[&>td]:px-4 [&>td]:py-3 [&>td]:align-middle",
              i < stats.length - 1 && "border-b border-[var(--color-border)]",
            )}
          >
            <td className="font-medium text-[var(--color-text)]">{rep.name}</td>
            <td className="text-center tabular-nums font-semibold text-[var(--color-text)]">
              {rep.score}
            </td>
            <td className="text-center">
              <GradeBadge grade={rep.grade} />
            </td>
            <td className="text-center tabular-nums text-[var(--color-text-muted)]">
              {rep.calls}
            </td>
            <td className="text-center tabular-nums text-[var(--color-success)]">
              {rep.wins}
            </td>
            <td className="text-center tabular-nums text-[var(--color-danger)]">
              {rep.losses}
            </td>
            <td>
              {rep.avgObjRating !== null ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[var(--color-surface-muted)] rounded-full overflow-hidden max-w-[80px]">
                    <div
                      className="h-full bg-[var(--color-blue)] rounded-full"
                      style={{ width: `${(rep.avgObjRating / 5) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
                    {rep.avgObjRating.toFixed(1)}/5
                  </span>
                </div>
              ) : (
                <span className="text-xs text-[var(--color-text-subtle)]">
                  No objections
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function CompetitorTable({
  mentions,
  onRowClick,
}: {
  mentions: CompetitorMention[];
  onRowClick: (name: string) => void;
}) {
  const max = Math.max(...mentions.map((m) => m.mentions), 1);
  return (
    <TableWrap>
      <thead>
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
          <Th className="text-left w-[22%]">Competitor</Th>
          <Th className="text-left w-[50%]">Frequency</Th>
          <Th className="text-left w-[28%]">Accounts</Th>
        </tr>
      </thead>
      <tbody>
        {mentions.map((m, i) => (
          <tr
            key={m.name}
            onClick={() => onRowClick(m.name)}
            className={cn(
              "cursor-pointer hover:bg-[var(--color-surface-muted)] transition-colors duration-100",
              "[&>td]:px-4 [&>td]:py-3 [&>td]:align-middle",
              i < mentions.length - 1 &&
                "border-b border-[var(--color-border)]",
            )}
          >
            <td className="font-medium text-[var(--color-text)]">{m.name}</td>
            <td>
              <HBar value={m.mentions} max={max} count={m.mentions} />
            </td>
            <td>
              <div className="flex flex-wrap gap-1">
                {m.accounts.map((a) => (
                  <Badge key={a} variant="outline" className="text-[10px] py-0">
                    {a}
                  </Badge>
                ))}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

function ObjChart({
  data,
  onTypeClick,
}: {
  data: ObjPatternMonth[];
  onTypeClick: (month: string, type: string) => void;
}) {
  const allTypes = Array.from(
    new Set(data.flatMap((m) => Object.keys(m.types))),
  );
  const globalMax = Math.max(...data.flatMap((m) => Object.values(m.types)), 1);

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      {data.map((month, mi) => (
        <div
          key={month.month}
          className={cn(
            "px-4 py-4",
            mi < data.length - 1 && "border-b border-[var(--color-border)]",
          )}
        >
          <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-3 uppercase tracking-wide">
            {month.month}
          </p>
          <div className="flex flex-col gap-2">
            {allTypes
              .filter((t) => month.types[t])
              .sort((a, b) => (month.types[b] ?? 0) - (month.types[a] ?? 0))
              .map((type) => (
                <HBar
                  key={type}
                  label={type}
                  value={month.types[type] ?? 0}
                  max={globalMax}
                  count={month.types[type] ?? 0}
                  onClick={() => onTypeClick(month.month, type)}
                />
              ))}
            {allTypes.filter((t) => month.types[t]).length === 0 && (
              <p className="text-xs text-[var(--color-text-subtle)]">
                No objections recorded
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LossTable({
  reasons,
  onRowClick,
}: {
  reasons: LossReason[];
  onRowClick: (account: string) => void;
}) {
  return (
    <TableWrap>
      <thead>
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
          <Th className="text-left w-[16%]">Account</Th>
          <Th className="text-left w-[18%]">Rep</Th>
          <Th className="text-left w-[46%]">Reason</Th>
          <Th className="text-right w-[12%]">Amount</Th>
          <Th className="text-left w-[8%]">Date</Th>
        </tr>
      </thead>
      <tbody>
        {reasons.map((r, i) => (
          <tr
            key={r.account}
            onClick={() => onRowClick(r.account)}
            className={cn(
              "cursor-pointer hover:bg-[var(--color-surface-muted)] transition-colors duration-100",
              "[&>td]:px-4 [&>td]:py-3 [&>td]:align-middle",
              i < reasons.length - 1 && "border-b border-[var(--color-border)]",
            )}
          >
            <td className="font-medium text-[var(--color-text)]">
              {r.account}
            </td>
            <td className="text-[var(--color-text-muted)] truncate">{r.rep}</td>
            <td className="text-[var(--color-text-muted)] text-xs leading-snug">
              {r.reason}
            </td>
            <td className="text-right tabular-nums text-[var(--color-text-muted)]">
              ${r.amount.toLocaleString()}
            </td>
            <td className="text-[var(--color-text-subtle)] whitespace-nowrap text-xs">
              {new Date(r.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TrendsClient() {
  const [modal, setModal] = useState<ModalState | null>(null);

  const wonCount = ALL_CALLS.filter((c) => c.outcome === "won").length;
  const lostCount = ALL_CALLS.filter((c) => c.outcome === "lost").length;

  return (
    <>
      <PageHeader
        title="Trends"
        description={`Q2 2026 · ${ALL_CALLS.length} calls · ${REP_STATS.length} reps · ${wonCount} won · ${lostCount} lost`}
      />

      <Section
        title="Rep Performance"
        description="Score = objection response quality (70%) + win rate (30%). Graded A–D."
      >
        <RepTable
          stats={REP_STATS}
          onRowClick={(name) =>
            setModal({ title: `Calls — ${name}`, calls: callsForRep(name) })
          }
        />
      </Section>

      <Section
        title="Competitor Intelligence"
        description="Competitors mentioned across transcripts, summaries, and key insights."
      >
        <CompetitorTable
          mentions={COMPETITOR_MENTIONS}
          onRowClick={(name) =>
            setModal({
              title: `Calls mentioning ${name}`,
              calls: CALLS_BY_COMPETITOR[name] ?? [],
            })
          }
        />
      </Section>

      <Section
        title="Objection Patterns"
        description="Click any bar to see source calls. Frequency by month."
      >
        <ObjChart
          data={OBJ_BY_MONTH}
          onTypeClick={(month, type) =>
            setModal({
              title: `${type} objections — ${month}`,
              calls: callsForObjType(month, type),
            })
          }
        />
      </Section>

      <Section
        title="Reasons for Not Proceeding"
        description="Primary loss driver for each closed-lost deal."
      >
        <LossTable
          reasons={LOSS_REASONS}
          onRowClick={(account) =>
            setModal({
              title: `Lost deal — ${account}`,
              calls: callsForLoss(account),
            })
          }
        />
      </Section>

      <AnimatePresence>
        {modal && (
          <TrendsSourceModal
            key="trends-modal"
            title={modal.title}
            calls={modal.calls}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
