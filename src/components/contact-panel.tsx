"use client";

import { AtSign, ExternalLink, Mail, MapPin, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WebsetMatchReason } from "@/lib/supabase/types";

export interface Contact {
  role: "primary" | "alternate";
  name: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  pictureUrl: string | null;
  location?: string | null;
  matchReasons?: WebsetMatchReason[] | null;
}

// Rep-facing context the panel uses to compose hooks. Most fields come
// straight from research-account.ts (Claude-distilled timing signals)
// plus the account-level fit summary. All optional — the panel
// degrades to identity + match-reason when research hasn't run yet.
export interface AccountContactContext {
  companyName?: string;
  roleTitle?: string | null;
  reasonToBelieve?: string | null;
  fundingStage?: string | null;
  industry?: string | null;
  recentNews?: Array<{
    headline: string;
    relevance: string;
    published_at?: string | null;
  }>;
  recentFunding?: {
    stage: string;
    amount_usd?: number | null;
    closed_at?: string | null;
    investors?: string[];
  } | null;
  hiringTrajectory?: {
    trend: "accelerating" | "steady" | "slowing";
    signal_roles: string[];
    net_30d?: number | null;
  } | null;
  competitorMentions?: Array<{ competitor: string; context: string }>;
  techStackGaps?: string[];
}

function truncateSentence(value: string, max = 150): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

// Derives an actionable "why this contact" from role + title + account context.
// Exa match reasons are employment verifications ("still works there"), not signals
// a rep can act on — so we build this from what we actually know about the account.
function contactWhy(
  contact: Contact,
  context: AccountContactContext | undefined,
): string | null {
  const title = contact.title;
  const company = context?.companyName;
  const roleSignal = context?.roleTitle;
  if (!title) return null;

  const isBuyer = contact.role === "primary";
  if (roleSignal && company) {
    const verb = isBuyer
      ? "likely owns the decision for"
      : "leads the team driving";
    return `${title} at ${company} — ${verb} ${roleSignal}.`;
  }
  if (company) {
    const signal = isBuyer
      ? "sits in the buying motion"
      : "leads a relevant team";
    return `${title} at ${company} — ${signal}.`;
  }
  return `${title} — ${isBuyer ? "economic buyer" : "team lead in the use-case"}.`;
}

// Search intent at discovery time decides this label:
//   primary  ← Webset criteria "economic buyer, champion, or end user"
//   alternate ← Webset criteria "manages or leads a team related to the role"
// We surface the intent rather than re-deriving from title so the rep
// knows which slot the pipeline filled.
function roleLabel(contact: Contact): string {
  return contact.role === "primary" ? "Buyer" : "Lead";
}

function openerLine(
  contact: Contact,
  context: AccountContactContext | undefined,
  verbose: boolean,
): string | null {
  const remit = contact.title ?? "their remit";
  const news = context?.recentNews?.[0];
  if (news?.headline) {
    const headline = verbose
      ? news.headline
      : truncateSentence(news.headline, 70);
    return `Lead with "${headline}" — pivot to ${remit}.`;
  }
  const funding = context?.recentFunding;
  if (funding?.stage) {
    const investor = funding.investors?.[0];
    return investor
      ? `Lead with the ${funding.stage} (${investor}) — pivot to ${remit}.`
      : `Lead with the ${funding.stage} round — pivot to ${remit}.`;
  }
  if (
    context?.hiringTrajectory?.trend === "accelerating" &&
    context.hiringTrajectory.signal_roles?.length
  ) {
    const role = context.hiringTrajectory.signal_roles[0];
    return `Lead with accelerating ${role} hiring — pivot to ${remit}.`;
  }
  return null;
}

function outreachAngles(
  contact: Contact,
  context: AccountContactContext | undefined,
  hasOpener: boolean,
  verbose: boolean,
): string[] {
  const angles: string[] = [];

  if (context?.competitorMentions?.[0]) {
    const cm = context.competitorMentions[0];
    angles.push(
      `Competitor pull: ${cm.competitor} — frame the gap on what's next.`,
    );
  }

  if (
    !hasOpener &&
    context?.hiringTrajectory?.signal_roles?.length &&
    context.hiringTrajectory.trend !== "slowing"
  ) {
    const r = context.hiringTrajectory.signal_roles[0];
    angles.push(
      `Hiring ${context.hiringTrajectory.trend}: ${r} — proof of where budget is moving.`,
    );
  }

  if (context?.techStackGaps?.[0]) {
    angles.push(`Stack gap: ${context.techStackGaps[0]}.`);
  }

  if (angles.length === 0 && context?.reasonToBelieve) {
    angles.push(
      verbose
        ? context.reasonToBelieve
        : truncateSentence(context.reasonToBelieve, 130),
    );
  }

  if (angles.length === 0 && contact.title) {
    angles.push(`Ask what's top-of-mind for ${contact.title} this quarter.`);
  }

  return angles.slice(0, hasOpener ? 1 : 2);
}

export function ContactPanel({
  contacts,
  className,
  variant = "rich",
  context,
  verbose = false,
}: {
  contacts: Contact[];
  className?: string;
  variant?: "plain" | "rich";
  context?: AccountContactContext;
  // When true, skip per-line truncation. Used by AccountCard's expanded
  // state so "Why" / "Open" / fallback angles render the full string.
  verbose?: boolean;
}) {
  const visible = contacts.filter((contact) => contact.name);
  if (visible.length === 0) return null;

  if (variant === "plain") {
    const contact = visible[0];
    return (
      <p className={cn("text-xs text-[var(--color-text-subtle)]", className)}>
        {contact.name}
        {contact.title && ` · ${contact.title}`}
      </p>
    );
  }

  // Anchors live inside a click-to-expand card; stop propagation so
  // following the link doesn't toggle the card collapsed.
  const stopBubble = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className={cn("space-y-2", className)}>
      {visible.map((contact) => {
        const why = contactWhy(contact, context);
        const opener = openerLine(contact, context, verbose);
        const angles = outreachAngles(contact, context, !!opener, verbose);
        const label = roleLabel(contact);
        return (
          <div
            key={`${contact.role}-${contact.name}`}
            className="space-y-1.5 border-t border-[var(--border)] pt-2 text-xs text-[var(--color-text-subtle)] first:border-t-0 first:pt-0"
          >
            <div className="flex min-w-0 items-center gap-2">
              {contact.pictureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={contact.pictureUrl}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-muted)]">
                  <UserRound size={12} aria-hidden="true" />
                </span>
              )}
              <span className="min-w-0 truncate">
                <span className="text-[var(--color-text)]">{contact.name}</span>
                {contact.title && ` · ${contact.title}`}
              </span>
              <span className="shrink-0 rounded-sm border border-[var(--border)] px-1 py-0 text-[10px] uppercase tracking-normal">
                {label}
              </span>
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  onClick={stopBubble}
                  className="shrink-0 rounded-sm hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]"
                  aria-label={`Email ${contact.name}`}
                >
                  <Mail size={12} aria-hidden="true" />
                </a>
              )}
              {contact.linkedinUrl && (
                <a
                  href={contact.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={stopBubble}
                  className="shrink-0 rounded-sm hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]"
                  aria-label={`${contact.name} profile`}
                >
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
              {contact.xUrl && (
                <a
                  href={contact.xUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={stopBubble}
                  className="shrink-0 rounded-sm hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]"
                  aria-label={`${contact.name} X profile`}
                >
                  <AtSign size={12} aria-hidden="true" />
                </a>
              )}
            </div>

            {contact.location && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span
                  className="inline-flex min-w-0 items-center gap-0.5"
                  aria-label={`Location: ${contact.location}`}
                >
                  <MapPin size={11} aria-hidden="true" />
                  <span className="truncate">{contact.location}</span>
                </span>
              </div>
            )}

            {why && (
              <p className="leading-relaxed text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">
                  Why:
                </span>{" "}
                {why}
              </p>
            )}

            {opener && (
              <p className="leading-relaxed text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">
                  Open:
                </span>{" "}
                {opener}
              </p>
            )}

            {angles.length > 0 && (
              <div className="space-y-0.5 leading-relaxed text-[var(--color-text-muted)]">
                {angles.map((angle) => (
                  <div key={angle} className="flex gap-1.5">
                    <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-[var(--color-text-subtle)]" />
                    <span>{angle}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
