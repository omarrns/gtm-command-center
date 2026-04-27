"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  TrendingUp,
  Globe2,
  Clock,
  Radio,
  Moon,
  X,
  Search,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { OpportunityStage } from "@/lib/supabase/types";
import { ContactPanel, type Contact } from "@/components/contact-panel";
import { useJobPoll } from "@/lib/jobs/use-job-poll";
import { skipOpportunityAction } from "../actions";
import { findContactsForAccountAction } from "../accounts/actions";

// Shared card for GTM account rows. /activate renders a live preview
// via AccountActivationResult; /accounts renders persisted pipeline
// output projected from OpportunityRow + analyses.result. Both flows
// feed the same flat prop shape so the visual stays consistent and
// adding a third consumer (e.g. watchlist detail) is a drop-in.

// Slim projection of GtmAccountResearch (research-account.ts) — we keep
// the shape duplicated here so this client component never imports
// from a server-only file. /accounts maps the parsed research_reports
// row into this shape; /activate's preview omits it entirely (research
// only runs at the researched stage).
export interface AccountResearchSummary {
  recentNews: Array<{
    headline: string;
    relevance: string;
    published_at: string | null;
  }>;
  recentFunding: {
    stage: string;
    amount_usd: number | null;
    closed_at: string | null;
    investors: string[];
  } | null;
  hiringTrajectory: {
    trend: "accelerating" | "steady" | "slowing";
    signal_roles: string[];
    net_30d: number | null;
  } | null;
  competitorMentions: Array<{ competitor: string; context: string }>;
  techStackGaps: string[];
}

export interface AccountCardProps {
  companyName: string;
  companyDomain: string | null;
  roleTitle: string | null;
  score: number;
  stage: OpportunityStage;
  tier: "A" | "B" | "C";
  verdict: "Pursue" | "Worth exploring" | "Skip";
  reasonToBelieve: string;
  fundingStage: string | null;
  employeeCount: number | null;
  industry: string | null;
  // Optional: enrichment chips shown only on the persisted-queue view
  discoveredAt?: string;
  source?: "theirstack" | "exa-dormant";
  // Dismiss affordance: only rendered when both are set. /accounts passes
  // them; /activate's static preview does not. canSkip is derived from
  // SKIPPABLE_STAGES so we never ship a button that would visibly fail
  // on a terminal-stage row (sent / replied / sending).
  opportunityId?: string;
  canSkip?: boolean;
  contacts?: Contact[];
  research?: AccountResearchSummary;
}

function whyNowLine(research: AccountResearchSummary | undefined): {
  text: string;
  timestamp: string | null;
} | null {
  if (!research) return null;
  const news = research.recentNews?.[0];
  if (news?.headline) {
    const text = news.relevance
      ? `${news.headline} — ${news.relevance}`
      : news.headline;
    return { text, timestamp: news.published_at ?? null };
  }
  const funding = research.recentFunding;
  if (funding?.stage) {
    const amount = funding.amount_usd
      ? ` $${Math.round(funding.amount_usd / 1_000_000)}M`
      : "";
    const investor = funding.investors?.[0]
      ? ` led by ${funding.investors[0]}`
      : "";
    return {
      text: `${funding.stage}${amount}${investor}`,
      timestamp: funding.closed_at,
    };
  }
  const hiring = research.hiringTrajectory;
  if (hiring?.trend === "accelerating" && hiring.signal_roles?.length) {
    return {
      text: `Hiring accelerating: ${hiring.signal_roles.slice(0, 2).join(", ")}`,
      timestamp: null,
    };
  }
  return null;
}

function tierVariant(
  tier: "A" | "B" | "C",
): "default" | "secondary" | "outline" {
  if (tier === "A") return "default";
  if (tier === "B") return "secondary";
  return "outline";
}

function verdictColor(verdict: "Pursue" | "Worth exploring" | "Skip") {
  if (verdict === "Pursue") return "var(--color-success)";
  if (verdict === "Worth exploring") return "var(--color-warning)";
  return "var(--color-text-subtle)";
}

function formatEmployees(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1000) return `${Math.round(n / 100) / 10}k employees`;
  return `${n} employees`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function contactJobLabel(status: string | undefined): string {
  if (status === "pending") return "Queued";
  if (status === "running") return "Researching contacts";
  return "Starting";
}

export function AccountCard({
  companyName,
  companyDomain,
  roleTitle,
  score,
  stage,
  tier,
  verdict,
  reasonToBelieve,
  fundingStage,
  employeeCount,
  industry,
  discoveredAt,
  source,
  opportunityId,
  canSkip,
  contacts = [],
  research,
}: AccountCardProps) {
  const router = useRouter();
  const whyNow = whyNowLine(research);
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const [contactJobId, setContactJobId] = useState<string | null>(null);
  const contactToastIdRef = useRef<string | number | null>(null);
  const contactJobStartedAtRef = useRef<number | null>(null);
  const contactJob = useJobPoll(contactJobId);
  const showDismiss = !!opportunityId && !!canSkip;
  const showFindContacts =
    !!opportunityId &&
    !contactJob.isLoading &&
    ((contacts.length === 0 &&
      (stage === "scored" ||
        stage === "researched" ||
        stage === "needs_contact")) ||
      (stage === "needs_contact" &&
        contacts.some((contact) => contact.email == null)));
  // Find-contacts is now a persistent bottom-right CTA, not hidden behind
  // the expand toggle, so it no longer counts as expandable content.
  const hasExpandableContent = contacts.length > 0;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (contactJob.isComplete) {
      timer = setTimeout(() => {
        const elapsed = contactJobStartedAtRef.current
          ? formatElapsed(Date.now() - contactJobStartedAtRef.current)
          : null;
        toast.success("Contact search complete", {
          id: contactToastIdRef.current ?? undefined,
          description: elapsed
            ? `${companyName} finished in ${elapsed}.`
            : `${companyName} is ready.`,
          duration: 6000,
        });
        contactToastIdRef.current = null;
        contactJobStartedAtRef.current = null;
        setContactJobId(null);
        router.refresh();
      }, 0);
    } else if (contactJob.isFailed && contactJob.error) {
      timer = setTimeout(() => {
        const elapsed = contactJobStartedAtRef.current
          ? formatElapsed(Date.now() - contactJobStartedAtRef.current)
          : null;
        toast.error("Contact search failed", {
          id: contactToastIdRef.current ?? undefined,
          description: elapsed
            ? `${contactJob.error} (${elapsed})`
            : contactJob.error,
          duration: 9000,
        });
        contactToastIdRef.current = null;
        contactJobStartedAtRef.current = null;
        setContactJobId(null);
      }, 0);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [
    companyName,
    contactJob.error,
    contactJob.isComplete,
    contactJob.isFailed,
    router,
  ]);

  useEffect(() => {
    if (!contactJobId || contactJob.isComplete || contactJob.isFailed) return;

    function updateStatusToast() {
      const startedAt = contactJobStartedAtRef.current ?? Date.now();
      contactJobStartedAtRef.current = startedAt;
      const elapsed = formatElapsed(Date.now() - startedAt);
      const label = contactJobLabel(contactJob.job?.status);
      contactToastIdRef.current = toast.loading(`${label} • ${elapsed}`, {
        id: contactToastIdRef.current ?? undefined,
        description: `${companyName}. This can take a few minutes.`,
        duration: Infinity,
      });
    }

    updateStatusToast();
    const interval = setInterval(updateStatusToast, 1000);
    return () => clearInterval(interval);
  }, [
    companyName,
    contactJob.job?.status,
    contactJob.isComplete,
    contactJob.isFailed,
    contactJobId,
  ]);

  function handleSkip() {
    if (!opportunityId) return;
    startTransition(async () => {
      const result = await skipOpportunityAction(opportunityId);
      if (result.ok) {
        toast.success(`${companyName} dismissed`);
        // revalidatePath in the action keeps the next navigation fresh;
        // router.refresh re-fetches the current RSC tree so the row
        // disappears immediately from the live view.
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleCardClick() {
    // Don't toggle when the user is selecting body text inside the card.
    if (window.getSelection()?.toString()) return;
    setIsExpanded((prev) => !prev);
  }

  function handleCardKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsExpanded((prev) => !prev);
    }
  }

  function handleFindContacts() {
    if (!opportunityId) return;
    startTransition(async () => {
      const result = await findContactsForAccountAction(opportunityId);
      if (result.ok) {
        if (result.jobId) {
          contactJobStartedAtRef.current = Date.now();
          contactToastIdRef.current = toast.loading("Queued • 0:00", {
            id: contactToastIdRef.current ?? undefined,
            description: `${companyName}. This can take a few minutes.`,
            duration: Infinity,
          });
          setContactJobId(result.jobId);
        } else {
          toast.info("Contact search is already queued");
        }
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Card
      role={hasExpandableContent ? "button" : undefined}
      tabIndex={hasExpandableContent ? 0 : undefined}
      aria-expanded={hasExpandableContent ? isExpanded : undefined}
      onClick={hasExpandableContent ? handleCardClick : undefined}
      onKeyDown={hasExpandableContent ? handleCardKeyDown : undefined}
      className={cn(
        "gap-0 p-4 max-w-[920px] flex flex-col",
        "motion-safe:transition-[box-shadow,background-color] motion-safe:duration-200 motion-safe:ease-out",
        hasExpandableContent &&
          "cursor-pointer hover:bg-[var(--color-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{companyName}</h3>
            <Badge variant={tierVariant(tier)}>Tier {tier}</Badge>
            {source === "exa-dormant" && (
              <Badge
                variant="outline"
                className="text-[var(--color-text-subtle)]"
              >
                <Moon size={10} />
                Dormant
              </Badge>
            )}
            {source === "theirstack" && (
              <Badge
                variant="outline"
                className="text-[var(--color-text-subtle)]"
              >
                <Radio size={10} />
                Hiring
              </Badge>
            )}
          </div>
          {companyDomain && (
            <p className="text-xs text-[var(--color-text-subtle)] truncate">
              {companyDomain}
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-start gap-2">
          <div className="text-right">
            <div className="text-base font-semibold tabular-nums">{score}</div>
            <div
              className="text-xs font-medium"
              style={{ color: verdictColor(verdict) }}
            >
              {verdict}
            </div>
            {hasExpandableContent && (
              // Subtle click affordance — a count + small caret living
              // inside the score column, not a standalone button. The
              // whole card is the clickable surface; this just signals
              // that there's more to expand.
              <div className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-[var(--color-text-subtle)] whitespace-nowrap">
                <span>
                  {isExpanded
                    ? "Hide"
                    : `${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}
                </span>
                <ChevronDown
                  size={10}
                  aria-hidden="true"
                  className={cn(
                    "motion-safe:transition-transform motion-safe:duration-200",
                    isExpanded && "rotate-180",
                  )}
                />
              </div>
            )}
          </div>
          {showDismiss && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
              onClick={(e) => {
                e.stopPropagation();
                handleSkip();
              }}
              disabled={isPending}
              aria-label={`Dismiss ${companyName}`}
            >
              <X size={14} />
            </Button>
          )}
        </div>
      </div>

      {reasonToBelieve && (
        <p
          className={cn(
            "text-sm leading-relaxed mt-3",
            !isExpanded && "line-clamp-3",
          )}
        >
          {reasonToBelieve}
        </p>
      )}

      {whyNow && (
        // Body and timestamp on separate lines so line-clamp-2 only
        // ever truncates the body — the timestamp can't get clipped
        // mid-character ("· 5d…").
        <div className="text-xs text-[var(--color-text-muted)] mt-2">
          <p className={cn("leading-relaxed", !isExpanded && "line-clamp-2")}>
            <span className="font-medium text-[var(--color-text)]">
              Why now:
            </span>{" "}
            {whyNow.text}
          </p>
          {whyNow.timestamp && (
            <p className="text-[var(--color-text-subtle)] mt-0.5 leading-tight">
              {formatRelativeTime(whyNow.timestamp)}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)] mt-3">
        {roleTitle && (
          <span className="inline-flex items-center gap-1">
            <Building2 size={12} />
            Hiring: {roleTitle}
          </span>
        )}
        {fundingStage && (
          <span className="inline-flex items-center gap-1">
            <TrendingUp size={12} />
            {fundingStage}
          </span>
        )}
        {employeeCount != null && (
          <span className="inline-flex items-center gap-1">
            <Users size={12} />
            {formatEmployees(employeeCount)}
          </span>
        )}
        {industry && (
          <span className="inline-flex items-center gap-1">
            <Globe2 size={12} />
            {industry}
          </span>
        )}
        {discoveredAt && (
          <span className="inline-flex items-center gap-1">
            <Clock size={12} />
            {formatRelativeTime(discoveredAt)}
          </span>
        )}
      </div>

      {hasExpandableContent && (
        <div
          className={cn(
            "grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out",
            isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden min-h-0">
            <div className="mt-3 pt-3 border-t border-[var(--border)]">
              <ContactPanel
                contacts={contacts}
                verbose={isExpanded}
                context={{
                  companyName,
                  roleTitle,
                  reasonToBelieve,
                  fundingStage,
                  industry,
                  recentNews: research?.recentNews,
                  recentFunding: research?.recentFunding,
                  hiringTrajectory: research?.hiringTrajectory,
                  competitorMentions: research?.competitorMentions,
                  techStackGaps: research?.techStackGaps,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showFindContacts && (
        <div className="mt-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleFindContacts();
            }}
            disabled={isPending || contactJob.isLoading}
          >
            <Search size={13} />
            Find contacts
          </Button>
        </div>
      )}
    </Card>
  );
}
