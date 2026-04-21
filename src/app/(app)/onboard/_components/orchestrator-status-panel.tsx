"use client";

import {
  CheckCircle2,
  AlertCircle,
  Circle,
  HelpCircle,
  Loader2,
} from "lucide-react";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";
import type { ClientInterviewTemplate } from "@/lib/onboarding/templates/types";

interface StatusPanelProps {
  state: OrchestratorState | null;
  clientTemplate: ClientInterviewTemplate;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n).trimEnd()}…`;
}

export function OrchestratorStatusPanel({
  state,
  clientTemplate,
}: StatusPanelProps) {
  if (!state || state.status === "empty") {
    return (
      <aside className="p-4 text-xs text-[var(--color-text-subtle)]">
        Waiting for the first artifact…
      </aside>
    );
  }

  const artifacts = state.artifacts;
  const succeeded = artifacts.filter((a) => a.status === "succeeded");
  const failed = artifacts.filter((a) => a.status === "failed");

  const inferred = clientTemplate.dimensions
    .map((d) => {
      const dim = state.dimensions[d.key];
      return { key: d.key, label: d.label, dim };
    })
    .filter((x) => x.dim && x.dim.status !== "unknown");

  const stillNeed = clientTemplate.dimensions
    .map((d) => {
      const dim = state.dimensions[d.key];
      return { key: d.key, label: d.label, dim };
    })
    .filter(
      (x) =>
        !x.dim ||
        x.dim.status === "unknown" ||
        x.dim.status === "needs_question",
    );

  return (
    <aside className="border-l border-[var(--border)] bg-[var(--color-surface-muted)] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] shrink-0">
        <h3 className="text-xs font-semibold text-[var(--color-text)]">
          What the agent sees
        </h3>
        {state.status === "analyzing" && (
          <p className="text-[10px] text-[var(--color-text-subtle)] mt-1 flex items-center gap-1">
            <Loader2 size={10} className="animate-spin" /> reading your
            artifacts
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Read */}
        <section className="px-4 py-3 border-b border-[var(--border)]">
          <h4 className="text-[10px] uppercase tracking-wide font-semibold text-[var(--color-text-subtle)] mb-2">
            Read ({succeeded.length} / {artifacts.length})
          </h4>
          <ul className="space-y-1.5">
            {artifacts.length === 0 && (
              <li className="text-xs text-[var(--color-text-subtle)]">
                No artifacts yet.
              </li>
            )}
            {artifacts.map((a) => (
              <li key={a.id} className="flex items-start gap-1.5 text-xs">
                {a.status === "succeeded" ? (
                  <CheckCircle2
                    size={12}
                    className="text-[var(--color-success)] shrink-0 mt-0.5"
                  />
                ) : (
                  <AlertCircle
                    size={12}
                    className="text-[var(--color-danger)] shrink-0 mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {a.sourceLabel ?? a.sourceUrl ?? a.kind}
                  </div>
                  {a.status === "failed" && a.errorMessage && (
                    <div className="text-[var(--color-danger)] text-[10px] mt-0.5">
                      {truncate(a.errorMessage, 80)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {failed.length > 0 && (
            <p className="mt-2 text-[10px] text-[var(--color-text-subtle)]">
              Paste text or upload a PDF for anything that failed.
            </p>
          )}
        </section>

        {/* Inferred */}
        {inferred.length > 0 && (
          <section className="px-4 py-3 border-b border-[var(--border)]">
            <h4 className="text-[10px] uppercase tracking-wide font-semibold text-[var(--color-text-subtle)] mb-2">
              Inferred
            </h4>
            <ul className="space-y-2">
              {inferred.map((x) => {
                if (!x.dim) return null;
                const confident =
                  x.dim.status === "answered" ||
                  x.dim.confidence >= x.dim.threshold;
                return (
                  <li key={x.key} className="text-xs">
                    <div className="flex items-center gap-1.5">
                      {confident ? (
                        <CheckCircle2
                          size={12}
                          className="text-[var(--color-success)] shrink-0"
                        />
                      ) : (
                        <Circle
                          size={12}
                          className="text-[var(--color-text-subtle)] shrink-0"
                        />
                      )}
                      <span className="font-medium">{x.label}</span>
                      <span className="text-[10px] text-[var(--color-text-subtle)] ml-auto">
                        {(x.dim.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-[var(--color-text-muted)] mt-0.5 pl-4 leading-snug">
                      {truncate(x.dim.summary, 140)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Still need */}
        {stillNeed.length > 0 && (
          <section className="px-4 py-3">
            <h4 className="text-[10px] uppercase tracking-wide font-semibold text-[var(--color-text-subtle)] mb-2">
              Still asking
            </h4>
            <ul className="space-y-1.5">
              {stillNeed.map((x) => (
                <li
                  key={x.key}
                  className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]"
                >
                  <HelpCircle
                    size={12}
                    className="text-[var(--color-text-subtle)] shrink-0"
                  />
                  <span>{x.label}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
