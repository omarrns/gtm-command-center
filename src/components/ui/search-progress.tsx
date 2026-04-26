"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Stepper-style progress used by long-running search/score flows where the
// caller already drives a phase index (e.g. activation's REASSURANCE_INTERVALS).
// Renders one dot per step, a connecting rail behind them, and a swappable
// status line below. The active step softly pulses; completed steps are solid;
// upcoming steps sit at low opacity. Caller owns the timing.

interface SearchProgressProps {
  /** Currently active step index (0-based). */
  step: number;
  /** Total number of steps. Must be >= 1. */
  total: number;
  /** Status copy for the active step. */
  message: string;
  className?: string;
}

export function SearchProgress({
  step,
  total,
  message,
  className,
}: SearchProgressProps) {
  const safeTotal = Math.max(1, total);
  const safeStep = Math.min(Math.max(0, step), safeTotal - 1);
  // Rail fill: 0% on first step, 100% on last; even spacing in between.
  const fillPct = safeTotal === 1 ? 100 : (safeStep / (safeTotal - 1)) * 100;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="relative w-full px-2">
        {/* Rail (track) */}
        <div
          aria-hidden="true"
          className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-[var(--border)]"
        />
        {/* Rail (fill) — animates via scaleX so we never animate `width`. */}
        <motion.div
          aria-hidden="true"
          className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 origin-left bg-[var(--color-blue)]"
          initial={false}
          animate={{ scaleX: fillPct / 100 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
        />
        {/* Steps */}
        <ol className="relative flex items-center justify-between">
          {Array.from({ length: safeTotal }).map((_, i) => {
            const isComplete = i < safeStep;
            const isActive = i === safeStep;
            return (
              <li
                key={i}
                aria-current={isActive ? "step" : undefined}
                className="relative flex h-5 w-5 items-center justify-center"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative rounded-full transition-all duration-300",
                    isActive
                      ? "h-3 w-3 bg-[var(--color-blue)] ring-[3px] ring-[var(--color-blue)]/15"
                      : isComplete
                        ? "h-2 w-2 bg-[var(--color-blue)]"
                        : "h-2 w-2 bg-[var(--color-text-subtle)]/40",
                  )}
                />
                <span className="sr-only">
                  Step {i + 1} of {safeTotal}
                  {isActive ? " (in progress)" : ""}
                  {isComplete ? " (complete)" : ""}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="relative flex h-5 items-center px-2">
        <AnimatePresence mode="wait">
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute text-sm text-[var(--color-text-muted)]"
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
