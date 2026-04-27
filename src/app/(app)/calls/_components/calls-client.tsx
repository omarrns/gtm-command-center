"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { FadeIn } from "@/components/ui/fade-in";
import { MOCK_CALLS } from "@/lib/calls/data";
import { CallDetailModal } from "./call-detail-modal";
import { MultiChatModal } from "./multi-chat-modal";
import { OutcomeBadge, OUTCOME_LABEL } from "./outcome-badge";
import type { SalesCall, CallOutcome } from "@/lib/calls/types";
import { cn } from "@/lib/utils";

const OUTCOMES: CallOutcome[] = ["ongoing", "won", "lost"];

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

function Checkbox({
  checked,
  indeterminate,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={ariaLabel}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 cursor-pointer rounded accent-[var(--color-blue)]"
    />
  );
}

export function CallsClient() {
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<CallOutcome | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [chatOpen, setChatOpen] = useState(false);

  const filtered = useMemo(() => {
    return MOCK_CALLS.filter((c) => {
      const matchSearch =
        !search ||
        c.title.toLowerCase().includes(search.toLowerCase()) ||
        c.account.toLowerCase().includes(search.toLowerCase()) ||
        c.rep.toLowerCase().includes(search.toLowerCase());
      const matchOutcome = !outcomeFilter || c.outcome === outcomeFilter;
      return matchSearch && matchOutcome;
    });
  }, [search, outcomeFilter]);

  const selectedIndex = filtered.findIndex((c) => c.id === selectedId);
  const selectedCall = selectedIndex !== -1 ? filtered[selectedIndex] : null;

  const filteredSelectedCount = filtered.filter((c) =>
    selectedIds.has(c.id),
  ).length;
  const allFilteredSelected =
    filtered.length > 0 && filteredSelectedCount === filtered.length;
  const someFilteredSelected =
    filteredSelectedCount > 0 && !allFilteredSelected;

  const checkedCalls = MOCK_CALLS.filter((c) => selectedIds.has(c.id));

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllFiltered(checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const c of filtered) {
        if (checked) next.add(c.id);
        else next.delete(c.id);
      }
      return next;
    });
  }

  function navigate(delta: number) {
    const next = filtered[selectedIndex + delta];
    if (next) setSelectedId(next.id);
  }

  return (
    <FadeIn>
      <PageHeader title="Calls" description="Sources: Gong, Salesforce" />

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
        <Select
          value={outcomeFilter || "all"}
          onValueChange={(value) =>
            setOutcomeFilter(
              !value || value === "all" ? "" : (value as CallOutcome),
            )
          }
        >
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {OUTCOMES.map((o) => (
              <SelectItem key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative h-8 mb-3">
        <AnimatePresence mode="wait" initial={false}>
          {selectedIds.size === 0 ? (
            <motion.p
              key="count"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute inset-0 flex items-center text-xs text-[var(--color-text-muted)]"
            >
              Showing {filtered.length} of {MOCK_CALLS.length} calls
            </motion.p>
          ) : (
            <motion.div
              key="bar"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="absolute inset-0 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-[var(--color-text)]">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors duration-100"
                >
                  Clear
                </button>
              </div>
              <Button size="sm" onClick={() => setChatOpen(true)}>
                <Sparkles size={12} />
                Chat with {selectedIds.size} transcript
                {selectedIds.size === 1 ? "" : "s"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
              <th className="w-[4%] px-4 py-2.5 text-left">
                <Checkbox
                  checked={allFilteredSelected}
                  indeterminate={someFilteredSelected}
                  onChange={toggleAllFiltered}
                  ariaLabel="Select all calls"
                />
              </th>
              {(
                [
                  ["Call", "text-left w-[36%]"],
                  ["Rep", "text-left w-[11%]"],
                  ["Account", "text-left w-[11%]"],
                  ["Amount", "text-right w-[9%]"],
                  ["Date", "text-left w-[9%]"],
                  ["Obj.", "text-center w-[4%]"],
                  ["Pain", "text-center w-[4%]"],
                  ["Flags", "text-center w-[4%]"],
                  ["Stage", "text-left w-[8%]"],
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
                isSelected={selectedIds.has(call.id)}
                onToggle={(checked) => toggleOne(call.id, checked)}
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

      {chatOpen && checkedCalls.length > 0 && (
        <MultiChatModal
          calls={checkedCalls}
          onClose={() => setChatOpen(false)}
        />
      )}
    </FadeIn>
  );
}

function CallRow({
  call,
  isLast,
  isSelected,
  onToggle,
  onClick,
}: {
  call: SalesCall;
  isLast: boolean;
  isSelected: boolean;
  onToggle: (checked: boolean) => void;
  onClick: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "h-20 cursor-pointer transition-colors duration-100 [&>td]:align-middle [&>td]:px-4",
        isSelected
          ? "bg-[var(--color-blue-muted)] hover:bg-[var(--color-blue-muted)]"
          : "hover:bg-[var(--color-surface-muted)]",
        !isLast && "border-b border-[var(--color-border)]",
      )}
    >
      <td>
        <Checkbox
          checked={isSelected}
          onChange={onToggle}
          ariaLabel={`Select ${call.title}`}
        />
      </td>
      <td>
        <p className="font-medium text-[var(--color-text)] leading-snug line-clamp-2">
          {call.title}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">
          {call.duration}
        </p>
      </td>
      <td className="text-[var(--color-text-muted)] truncate">{call.rep}</td>
      <td className="text-[var(--color-text-muted)] truncate">
        {call.account}
      </td>
      <td className="text-right text-[var(--color-text-muted)] whitespace-nowrap tabular-nums">
        ${call.amount.toLocaleString()}
      </td>
      <td className="text-[var(--color-text-muted)] whitespace-nowrap">
        {new Date(call.date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </td>
      <td className="text-center">
        <CountCell count={call.objectionCount} />
      </td>
      <td className="text-center">
        <CountCell count={call.painPointCount} />
      </td>
      <td className="text-center">
        <CountCell count={call.redFlagCount} />
      </td>
      <td>
        <OutcomeBadge outcome={call.outcome} />
      </td>
    </tr>
  );
}
