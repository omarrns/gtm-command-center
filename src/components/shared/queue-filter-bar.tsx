"use client";
import {
  Spinner,
  MagnifyingGlass,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface QueueFilterBarProps {
  companySearch: string;
  onCompanySearchChange: (value: string) => void;
  minScore: string;
  onMinScoreChange: (value: string) => void;
  maxScore: string;
  onMaxScoreChange: (value: string) => void;
  /** Optional call-site control (stage Select, discovered-window pill, tier Select, etc.). */
  leftSlot?: React.ReactNode;
  /** When provided, renders an Apply button and submits on form submit. Omit for live client-side filtering. */
  onApply?: () => void;
  applyPending?: boolean;
  hasActiveFilters?: boolean;
  onReset?: () => void;
  idPrefix?: string;
}

export function QueueFilterBar({
  companySearch,
  onCompanySearchChange,
  minScore,
  onMinScoreChange,
  maxScore,
  onMaxScoreChange,
  leftSlot,
  onApply,
  applyPending = false,
  hasActiveFilters = false,
  onReset,
  idPrefix = "queue",
}: QueueFilterBarProps) {
  const minId = `${idPrefix}-min-score`;
  const maxId = `${idPrefix}-max-score`;
  const companyId = `${idPrefix}-company`;

  const inner = (
    <div className="flex flex-wrap items-end gap-2 mb-5">
      {leftSlot}

      <div>
        <label
          htmlFor={minId}
          className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
        >
          Min Score
        </label>
        <Input
          id={minId}
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          placeholder="0"
          className="w-16 text-xs tabular-nums"
          value={minScore}
          onChange={(e) => onMinScoreChange(e.target.value)}
        />
      </div>

      <div>
        <label
          htmlFor={maxId}
          className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
        >
          Max Score
        </label>
        <Input
          id={maxId}
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          placeholder="100"
          className="w-16 text-xs tabular-nums"
          value={maxScore}
          onChange={(e) => onMaxScoreChange(e.target.value)}
        />
      </div>

      <div className="flex-1 min-w-[180px]">
        <label
          htmlFor={companyId}
          className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
        >
          Company
        </label>
        <div className="relative">
          <MagnifyingGlass
            size={13}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
          />
          <Input
            id={companyId}
            type="search"
            placeholder="Search company…"
            className="pl-7 text-xs"
            value={companySearch}
            onChange={(e) => onCompanySearchChange(e.target.value)}
          />
        </div>
      </div>

      {onApply && (
        <Button type="submit" size="sm" disabled={applyPending}>
          {applyPending && <Spinner size={14} className="animate-spin" />}
          {applyPending ? "Filtering…" : "Apply"}
        </Button>
      )}

      {hasActiveFilters && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="h-8 px-2.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-1 rounded-md"
        >
          Clear
        </button>
      )}
    </div>
  );

  if (onApply) {
    return (
      <form
        role="search"
        aria-label="Filter opportunities"
        onSubmit={(e) => {
          e.preventDefault();
          onApply();
        }}
      >
        {inner}
      </form>
    );
  }
  return inner;
}
