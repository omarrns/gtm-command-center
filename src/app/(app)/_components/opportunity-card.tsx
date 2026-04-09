"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  Send,
  Pencil,
  SkipForward,
  Flag,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime } from "@/lib/utils";
import type {
  OpportunityRow,
  OpportunityStage,
  EmailDraftRow,
} from "@/lib/supabase/types";
import {
  approveOpportunityAction,
  skipOpportunityAction,
  flagCompanyAction,
} from "../actions";
import { EmailVariantPicker } from "./email-variant-picker";

// ---------------------------------------------------------------------------
// Stage display config
// ---------------------------------------------------------------------------

const STAGE_CONFIG: Record<
  OpportunityStage,
  { label: string; className: string }
> = {
  discovered: { label: "Discovered", className: "badge" },
  scored: { label: "Scored", className: "badge badge-accent" },
  filtered: { label: "Filtered", className: "badge" },
  researched: { label: "Researched", className: "badge badge-accent" },
  needs_contact: { label: "Needs Contact", className: "badge badge-warning" },
  enriched: { label: "Enriched", className: "badge badge-accent" },
  drafted: { label: "Drafted", className: "badge badge-accent" },
  queued: { label: "Ready to Send", className: "badge badge-success" },
  sending: { label: "Sending", className: "badge badge-warning" },
  sent: { label: "Sent", className: "badge badge-success" },
  replied: { label: "Replied", className: "badge badge-success" },
  skipped: { label: "Skipped", className: "badge" },
};

function scoreColor(score: number | null): string {
  if (score == null) return "text-[var(--color-text-muted)]";
  if (score >= 80) return "text-[var(--color-success)]";
  if (score >= 60) return "text-[var(--color-warning)]";
  return "text-[var(--color-danger)]";
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OpportunityCardProps {
  opportunity: OpportunityRow;
  drafts: EmailDraftRow[];
  /** Summary text from linked analysis (pre-fetched) */
  analysisSummary?: string;
  /** Summary text from linked research (pre-fetched) */
  researchSummary?: string;
  /** Whether action buttons are shown (false for history cards) */
  showActions?: boolean;
  /** Backfill flag — card scored below threshold */
  isCloseMatch?: boolean;
  /** Called after any successful mutation (skip/flag/approve) */
  onAction?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OpportunityCard({
  opportunity,
  drafts,
  analysisSummary,
  researchSummary,
  showActions = true,
  isCloseMatch = false,
  onAction,
}: OpportunityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const stage = opportunity.stage as OpportunityStage;
  const stageInfo = STAGE_CONFIG[stage];
  const isTerminal =
    stage === "sent" || stage === "replied" || stage === "skipped";
  const isActionable = showActions && !isPending;
  const isDraftReadOnly = !showActions || isTerminal;
  const hasExpandableContent =
    drafts.length > 0 ||
    !!opportunity.analysis_id ||
    !!opportunity.research_id ||
    !!researchSummary ||
    !!opportunity.last_error;

  function handleApprove() {
    startTransition(async () => {
      const result = await approveOpportunityAction(opportunity.id);
      if (result.ok) {
        toast.success("Email approved and sent");
        onAction?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleSkip() {
    startTransition(async () => {
      const result = await skipOpportunityAction(opportunity.id);
      if (result.ok) {
        toast.success("Opportunity skipped");
        onAction?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleEditAndApprove() {
    setIsExpanded(true);
  }

  function handleFlag() {
    startTransition(async () => {
      const result = await flagCompanyAction(opportunity.id);
      if (result.ok) {
        toast.success(`${opportunity.company_name} added to watchlist`);
        onAction?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="surface p-4">
      {/* Row 1: Company + badges + View Job | Score + chevron */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate">
              {opportunity.company_name}
            </h3>
            <span className={stageInfo.className}>{stageInfo.label}</span>
            {isCloseMatch && (
              <span className="badge badge-warning">Close match</span>
            )}
            {opportunity.job_url && (
              <a
                href={opportunity.job_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--color-blue)] hover:underline inline-flex items-center gap-0.5 shrink-0"
              >
                View Job <ExternalLink size={10} />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {opportunity.score != null && (
            <span
              className={cn(
                "text-lg font-bold tabular-nums",
                scoreColor(opportunity.score),
              )}
            >
              {opportunity.score}
            </span>
          )}
          {hasExpandableContent && (
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

      {/* Row 2: Role title + posted date */}
      <div className="flex items-baseline gap-1 mt-0.5 text-xs">
        <span className="text-[var(--color-text-muted)] truncate min-w-0">
          {opportunity.role_title}
        </span>
        <span className="text-[var(--color-text-subtle)] shrink-0">
          {"· "}
          {formatRelativeTime(
            opportunity.job_posted_at ?? opportunity.discovered_at,
          )}
        </span>
      </div>

      {/* Row 3: Recipient info */}
      {opportunity.recipient_name && (
        <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
          {opportunity.recipient_name}
          {opportunity.recipient_title && ` · ${opportunity.recipient_title}`}
        </p>
      )}

      {/* Row 4: Fit rationale — always visible */}
      {analysisSummary && (
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mt-2 line-clamp-3">
          {analysisSummary}
        </p>
      )}

      {/* Action buttons */}
      {isActionable && (
        <div className="mt-3 flex items-center gap-1.5">
          {stage === "queued" && (
            <>
              <Button size="sm" onClick={handleApprove} disabled={isPending}>
                <Send size={13} />
                Approve
              </Button>
              {!isExpanded && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditAndApprove}
                  disabled={isPending}
                >
                  <Pencil size={13} />
                  Edit & Approve
                </Button>
              )}
            </>
          )}
          {!isTerminal && stage !== "sending" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              disabled={isPending}
            >
              <SkipForward size={13} />
              Skip
            </Button>
          )}
          {!isTerminal && stage !== "sending" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFlag}
              disabled={isPending}
            >
              <Flag size={13} />
              Flag
            </Button>
          )}
        </div>
      )}

      {/* Expanded detail — research, analysis link, drafts, error */}
      {isExpanded && hasExpandableContent && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-3">
          {(researchSummary || opportunity.research_id) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-[var(--color-text-muted)]">
                  Research
                </div>
                {opportunity.research_id && (
                  <Link
                    href={`/research/reports/${opportunity.research_id}`}
                    className="text-xs text-[var(--color-blue)] hover:underline"
                  >
                    View full report
                  </Link>
                )}
              </div>
              {researchSummary && (
                <p className="text-xs text-[var(--color-text)] leading-relaxed">
                  {researchSummary}
                </p>
              )}
            </div>
          )}

          {opportunity.analysis_id && (
            <Link
              href={`/analysis/${opportunity.analysis_id}`}
              className="inline-flex items-center gap-1 text-xs text-[var(--color-blue)] hover:underline"
            >
              View full analysis
            </Link>
          )}

          {drafts.length > 0 && (
            <EmailVariantPicker
              drafts={drafts}
              selectedDraftId={opportunity.selected_draft_id}
              opportunityId={opportunity.id}
              readOnly={isDraftReadOnly}
            />
          )}

          {opportunity.last_error && (
            <div className="text-xs text-[var(--color-danger)] bg-[var(--color-surface-muted)] rounded-md p-2">
              Error: {opportunity.last_error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
