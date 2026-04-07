"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { formatRelativeTime } from "@/lib/utils";
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
    <div className="space-y-4">
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
          maxLength={100}
          className="input flex-1 text-sm"
          disabled={isPending}
        />
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !companyName.trim()}
        >
          <Plus size={14} />
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
        <div className="space-y-2">
          {entries.map((entry) => (
            <WatchlistCard key={entry.id} entry={entry} />
          ))}
        </div>
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
  const sourceBadge = entry.source === "auto" ? "badge badge-accent" : "badge";

  return (
    <div className="surface p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate">
              {entry.company_name}
            </h3>
            <span className={sourceBadge}>{entry.source}</span>
            {alertCount > 0 && (
              <span className="badge badge-warning">
                {alertCount} alert{alertCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {entry.last_alert_at && (
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Last alert {formatRelativeTime(entry.last_alert_at)}
            </p>
          )}
          {!entry.webset_id && (
            <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
              No monitor active
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRemove}
            disabled={isPending}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
          >
            <Trash2 size={14} />
          </Button>
          {alertCount > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] transition-colors"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded alerts */}
      {isExpanded && alertCount > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
          {entry.alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
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
    <div className="surface-muted p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={typeInfo.className}>{typeInfo.label}</span>
        <span className="text-xs text-[var(--color-text-subtle)]">
          {formatRelativeTime(alert.detected_at)}
        </span>
      </div>
      <p className="text-sm font-medium text-[var(--color-text)]">
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
          className="inline-flex items-center gap-1 text-xs text-[var(--color-blue)] hover:underline"
        >
          Source <ExternalLink size={11} />
        </a>
      )}
    </div>
  );
}
