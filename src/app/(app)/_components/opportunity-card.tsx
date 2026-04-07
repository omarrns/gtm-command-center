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
import { cn } from "@/lib/utils";
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
}: OpportunityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const stage = opportunity.stage as OpportunityStage;
  const stageInfo = STAGE_CONFIG[stage];
  const isTerminal =
    stage === "sent" || stage === "replied" || stage === "skipped";
  const isActionable = showActions && !isPending;
  const isDraftReadOnly = !showActions || isTerminal;

  function handleApprove() {
    startTransition(async () => {
      const result = await approveOpportunityAction(opportunity.id);
      if (result.ok) {
        toast.success("Email approved and sent");
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
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleEditAndApprove() {
    // Expand the card so the user can edit the draft before approving
    setIsExpanded(true);
  }

  function handleFlag() {
    startTransition(async () => {
      const result = await flagCompanyAction(opportunity.id);
      if (result.ok) {
        toast.success(`${opportunity.company_name} added to watchlist`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="surface p-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate">
              {opportunity.company_name}
            </h3>
            <span className={stageInfo.className}>{stageInfo.label}</span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
            {opportunity.role_title}
          </p>
          {opportunity.recipient_name && (
            <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
              {opportunity.recipient_name}
              {opportunity.recipient_title &&
                ` · ${opportunity.recipient_title}`}
            </p>
          )}
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
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-surface-muted)] transition-colors"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-3">
          {/* Analysis summary + detail link */}
          {analysisSummary && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-medium text-[var(--color-text-muted)]">
                  Analysis
                </div>
                {opportunity.analysis_id && (
                  <Link
                    href={`/analysis/${opportunity.analysis_id}`}
                    className="text-xs text-[var(--color-blue)] hover:underline"
                  >
                    View full analysis
                  </Link>
                )}
              </div>
              <p className="text-xs text-[var(--color-text)] leading-relaxed">
                {analysisSummary}
              </p>
            </div>
          )}

          {/* Research summary + detail link */}
          {researchSummary && (
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
              <p className="text-xs text-[var(--color-text)] leading-relaxed">
                {researchSummary}
              </p>
            </div>
          )}

          {/* Email variant picker */}
          {drafts.length > 0 && (
            <EmailVariantPicker
              drafts={drafts}
              selectedDraftId={opportunity.selected_draft_id}
              opportunityId={opportunity.id}
              readOnly={isDraftReadOnly}
            />
          )}

          {/* Job URL link */}
          {opportunity.job_url && (
            <a
              href={opportunity.job_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[var(--color-blue)] hover:underline"
            >
              View Job Posting <ExternalLink size={11} />
            </a>
          )}

          {/* Error display */}
          {opportunity.last_error && (
            <div className="text-xs text-[var(--color-danger)] bg-[var(--color-surface-muted)] rounded-md p-2">
              Error: {opportunity.last_error}
            </div>
          )}
        </div>
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
          {stage !== "sent" &&
            stage !== "replied" &&
            stage !== "skipped" &&
            stage !== "sending" && (
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
          {stage !== "sent" &&
            stage !== "replied" &&
            stage !== "skipped" &&
            stage !== "sending" && (
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
    </div>
  );
}
