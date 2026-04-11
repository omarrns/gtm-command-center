"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Send,
  Pencil,
  SkipForward,
  Flag,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
import { STAGE_CONFIG } from "./stage-config";

function scoreColor(score: number | null): string {
  if (score == null) return "text-[var(--color-text-muted)]";
  if (score >= 80) return "text-[var(--color-success)]";
  if (score >= 60) return "text-[var(--color-warning)]";
  return "text-[var(--color-danger)]";
}

interface OpportunityCardProps {
  opportunity: OpportunityRow;
  drafts: EmailDraftRow[];
  analysisSummary?: string;
  researchSummary?: string;
  showActions?: boolean;
  isCloseMatch?: boolean;
  /** Hide the stage badge when the section header already communicates it */
  hideStageBadge?: boolean;
  onAction?: () => void;
}

export function OpportunityCard({
  opportunity,
  drafts,
  analysisSummary,
  researchSummary,
  showActions = true,
  isCloseMatch = false,
  hideStageBadge = false,
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
    <Card
      className={cn(
        "gap-0 p-4 transition-[box-shadow] duration-150 ease-out",
        showActions && "hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold truncate">
              {opportunity.company_name}
            </h3>
            {!hideStageBadge && (
              <Badge variant={stageInfo.variant}>{stageInfo.label}</Badge>
            )}
            {isCloseMatch && <Badge variant="warning">Close match</Badge>}
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
                "text-base font-bold tabular-nums",
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
              className={cn(
                "p-1.5 -m-0.5 rounded-lg text-[var(--color-text-muted)]",
                "hover:bg-[var(--color-surface-muted)] active:bg-[var(--color-surface-muted)]",
                "transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-1",
              )}
              aria-label={isExpanded ? "Collapse details" : "Expand details"}
              aria-expanded={isExpanded}
            >
              <ChevronDown
                size={14}
                className={cn(
                  "motion-safe:transition-transform motion-safe:duration-200",
                  isExpanded && "rotate-180",
                )}
              />
            </button>
          )}
        </div>
      </div>

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

      {opportunity.recipient_name && (
        <p className="text-xs text-[var(--color-text-subtle)] mt-0.5">
          {opportunity.recipient_name}
          {opportunity.recipient_title && ` · ${opportunity.recipient_title}`}
        </p>
      )}

      {analysisSummary && (
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mt-2 line-clamp-2">
          {analysisSummary}
        </p>
      )}

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
              className="text-[var(--color-text-subtle)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger)]/5"
            >
              <Flag size={13} />
              Flag
            </Button>
          )}
        </div>
      )}

      {hasExpandableContent && (
        <div
          className={cn(
            "grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div className="mt-3 pt-3 border-t border-[var(--border)] space-y-3">
              {(researchSummary || opportunity.research_id) && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">
                      Research
                    </span>
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
          </div>
        </div>
      )}
    </Card>
  );
}
