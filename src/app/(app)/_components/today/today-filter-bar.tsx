"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { WINDOW_OPTIONS, type DiscoveredWindow } from "../today-helpers";

interface TodayFilterBarProps {
  companySearch: string;
  onCompanySearchChange: (value: string) => void;
  minScore: string;
  onMinScoreChange: (value: string) => void;
  maxScore: string;
  onMaxScoreChange: (value: string) => void;
  discoveredWindow: DiscoveredWindow;
  onDiscoveredWindowChange: (value: DiscoveredWindow) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
}

export function TodayFilterBar({
  companySearch,
  onCompanySearchChange,
  minScore,
  onMinScoreChange,
  maxScore,
  onMaxScoreChange,
  discoveredWindow,
  onDiscoveredWindowChange,
  hasActiveFilters,
  onReset,
}: TodayFilterBarProps) {
  return (
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
                onClick={() => onDiscoveredWindowChange(opt.value)}
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
          onChange={(e) => onMinScoreChange(e.target.value)}
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
          onChange={(e) => onMaxScoreChange(e.target.value)}
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
            onChange={(e) => onCompanySearchChange(e.target.value)}
          />
        </div>
      </div>

      {hasActiveFilters && (
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
}
