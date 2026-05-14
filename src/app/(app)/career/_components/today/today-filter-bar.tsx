"use client";

import { cn } from "@/lib/utils";
import { WINDOW_OPTIONS, type DiscoveredWindow } from "../today-helpers";
import { QueueFilterBar } from "@/components/shared/queue-filter-bar";

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
    <QueueFilterBar
      idPrefix="today"
      companySearch={companySearch}
      onCompanySearchChange={onCompanySearchChange}
      minScore={minScore}
      onMinScoreChange={onMinScoreChange}
      maxScore={maxScore}
      onMaxScoreChange={onMaxScoreChange}
      hasActiveFilters={hasActiveFilters}
      onReset={onReset}
      leftSlot={
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
      }
    />
  );
}
