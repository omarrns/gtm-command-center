"use client";

import { useId, useState, useTransition } from "react";
import { ChevronDown, Plus, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn, formatRelativeTime } from "@/lib/utils";
import type {
  WatchlistRow,
  WatchlistAlertRow,
  WatchlistAlertType,
} from "@/lib/supabase/types";
import { addWatchlistAction, removeWatchlistAction } from "../actions";

// ---------------------------------------------------------------------------
// Alert type badge config
// ---------------------------------------------------------------------------

const ALERT_TYPE_CONFIG: Record<
  WatchlistAlertType,
  { label: string; className: string }
> = {
  funding: { label: "Funding", className: "badge badge-success" },
  hire: { label: "Hiring", className: "badge badge-accent" },
  launch: { label: "Launch", className: "badge badge-accent" },
  press: { label: "Press", className: "badge" },
  job_posting: { label: "Job Posting", className: "badge badge-warning" },
  leadership_change: {
    label: "Leadership",
    className: "badge badge-danger",
  },
};

// ---------------------------------------------------------------------------
// Alert count color by severity
// ---------------------------------------------------------------------------

function getAlertColor(count: number): string | undefined {
  if (count >= 10) return "var(--color-danger)";
  if (count >= 4) return "var(--color-warning)";
  if (count > 0) return "var(--color-text-muted)";
  return undefined;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WatchlistEntry extends WatchlistRow {
  alerts: WatchlistAlertRow[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WatchlistClient({ entries }: { entries: WatchlistEntry[] }) {
  const [companyName, setCompanyName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = companyName.trim();
    if (!trimmed) return;

    startTransition(async () => {
      const result = await addWatchlistAction(trimmed);
      if (result.ok) {
        toast.success(`${trimmed} added to watchlist`);
        setCompanyName("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* Add company form */}
      <form
        onSubmit={handleAdd}
        className="surface p-3 flex items-center gap-2"
      >
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Company name..."
          aria-label="Company name"
          maxLength={100}
          className="input flex-1 text-sm"
          disabled={isPending}
        />
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !companyName.trim()}
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus size={14} aria-hidden="true" />
          )}
          Add
        </Button>
      </form>

      {/* Entries */}
      {entries.length === 0 ? (
        <EmptyState
          message="No companies on your watchlist"
          hint="Add a company above or flag opportunities to track them here."
        />
      ) : (
        <ul className="space-y-3" role="list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <WatchlistCard entry={entry} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WatchlistCard
// ---------------------------------------------------------------------------

function WatchlistCard({ entry }: { entry: WatchlistEntry }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const alertsPanelId = useId();

  function handleRemove() {
    startTransition(async () => {
      const result = await removeWatchlistAction(entry.id);
      if (result.ok) {
        toast.success(`${entry.company_name} removed from watchlist`);
      } else {
        toast.error(result.error);
      }
    });
  }

  const alertCount = entry.alerts.length;
  const alertColor = getAlertColor(alertCount);
  const latestAlert = alertCount > 0 ? entry.alerts[0] : null;
  const isManualSource = entry.source === "manual";

  return (
    <div className="surface p-4">
      {/* Header row */}
      <div className="flex items-start gap-4">
        {/* Left: company info + preview */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold truncate text-[var(--color-text)]">
              {entry.company_name}
            </h3>
            {isManualSource && <span className="badge">Manual</span>}
            {!entry.webset_id && (
              <span className="text-[10px] text-[var(--color-text-subtle)] uppercase tracking-wider">
                No monitor
              </span>
            )}
          </div>

          {entry.last_alert_at && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Last alert {formatRelativeTime(entry.last_alert_at)}
            </p>
          )}

          {/* Latest alert preview — fills horizontal space */}
          {latestAlert && (
            <p className="text-[13px] text-[var(--color-text-muted)] truncate mt-1.5 leading-snug">
              {latestAlert.title}
            </p>
          )}
        </div>

        {/* Right: alert count + actions */}
        <div className="flex items-center gap-2 shrink-0">
          {alertCount > 0 && (
            <div className="flex flex-col items-center px-2 py-1 min-w-[40px]">
              <span
                className="text-lg font-bold tabular-nums leading-none"
                style={alertColor ? { color: alertColor } : undefined}
              >
                {alertCount}
              </span>
              <span className="text-[10px] text-[var(--color-text-subtle)] mt-0.5">
                alert{alertCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isPending}
            aria-label={`Remove ${entry.company_name}`}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
          >
            <Trash2 size={14} aria-hidden="true" />
          </Button>

          {alertCount > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className={cn(
                "p-1.5 rounded-md text-[var(--color-text-muted)]",
                "hover:bg-[var(--color-surface-muted)]",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-2",
              )}
              aria-expanded={isExpanded}
              aria-controls={alertsPanelId}
              aria-label={`${isExpanded ? "Collapse" : "Expand"} alerts for ${entry.company_name}`}
            >
              <ChevronDown
                size={14}
                aria-hidden="true"
                className={cn(
                  "transition-transform duration-200 ease-out motion-reduce:transition-none",
                  isExpanded && "rotate-180",
                )}
              />
            </button>
          )}
        </div>
      </div>

      {/* Expanded alerts */}
      {alertCount > 0 && (
        <div
          id={alertsPanelId}
          role="region"
          aria-label={`Alerts for ${entry.company_name}`}
          className={cn(
            "grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-2">
              {entry.alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlertCard
// ---------------------------------------------------------------------------

function AlertCard({ alert }: { alert: WatchlistAlertRow }) {
  const typeInfo = ALERT_TYPE_CONFIG[alert.alert_type];

  return (
    <article className="surface-muted p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={typeInfo.className}>{typeInfo.label}</span>
        <span className="text-[11px] text-[var(--color-text-subtle)] tabular-nums">
          {formatRelativeTime(alert.detected_at)}
        </span>
      </div>
      <p className="text-sm font-medium text-[var(--color-text)] leading-snug">
        {alert.title}
      </p>
      {alert.summary && (
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-3">
          {alert.summary}
        </p>
      )}
      {alert.source_url && (
        <a
          href={alert.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex items-center gap-1 text-xs text-[var(--color-blue)]",
            "hover:underline transition-colors duration-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-1",
          )}
        >
          Source <ExternalLink size={11} aria-hidden="true" />
        </a>
      )}
    </article>
  );
}
