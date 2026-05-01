"use client";

import { useEffect } from "react";
import {
  X,
  ArrowSquareOut,
} from "@phosphor-icons/react/ssr";
import { motion } from "motion/react";
import { OutcomeBadge } from "@/app/(app)/calls/_components/outcome-badge";
import type { SalesCall } from "@/lib/calls/types";

export function TrendsSourceModal({
  title,
  calls,
  onClose,
}: {
  title: string;
  calls: SalesCall[];
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 6 }}
        transition={{ duration: 0.14, ease: "easeOut" }}
        className="w-full max-w-lg bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              {title}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {calls.length}{" "}
              {calls.length === 1 ? "source call" : "source calls"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] transition-colors duration-100"
          >
            <X size={14} />
          </button>
        </div>

        <div className="divide-y divide-[var(--color-border)] max-h-[60vh] overflow-y-auto">
          {calls.length === 0 && (
            <p className="px-5 py-6 text-sm text-[var(--color-text-muted)]">
              No calls found.
            </p>
          )}
          {calls.map((call) => (
            <div key={call.id} className="flex items-start gap-3 px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)] leading-snug truncate">
                  {call.title}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {call.rep} · {call.account} ·{" "}
                  {new Date(call.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                <OutcomeBadge outcome={call.outcome} />
                <a
                  href={`https://app.gong.io/call?id=${call.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--color-blue)] hover:underline"
                >
                  Listen
                  <ArrowSquareOut size={11} />
                </a>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
