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

interface AccountContactContext {
  companyName?: string;
  roleTitle?: string | null;
  reasonToBelieve?: string | null;
  fundingStage?: string | null;
  industry?: string | null;
}

function positiveMatchReasons(
  reasons: WebsetMatchReason[] | null | undefined,
): string[] {
  return (reasons ?? [])
    .filter((r) => r.satisfied === "yes" && r.reasoning?.trim())
    .map((r) => r.reasoning.trim());
}

function truncateSentence(value: string, max = 150): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function contactWhy(
  contact: Contact,
  context?: AccountContactContext,
): string | null {
  const match = positiveMatchReasons(contact.matchReasons)[0];
  if (match) return truncateSentence(match);
  if (contact.title && context?.companyName) {
    return `${contact.title} at ${context.companyName}; likely relevant to this account motion.`;
  }
  return null;
}

function outreachAngles(
  contact: Contact,
  context?: AccountContactContext,
): string[] {
  const angles: string[] = [];

  if (context?.reasonToBelieve) {
    angles.push(`Open with fit: ${truncateSentence(context.reasonToBelieve, 120)}`);
  }

  if (context?.roleTitle) {
    angles.push(
      contact.role === "alternate"
        ? `Tie to hiring: ask how the ${context.roleTitle} search is changing team priorities.`
        : `Tie to hiring signal: ${context.roleTitle} suggests active investment in this function.`,
    );
  }

  if (context?.fundingStage) {
    angles.push(`Use timing: ${context.fundingStage} usually means new growth or operating pressure.`);
  }

  if (angles.length === 0 && contact.title) {
    angles.push(`Reference their ${contact.title} remit and ask what is top of mind this quarter.`);
  }

  return angles.slice(0, 2);
}

export function ContactPanel({
  contacts,
  className,
  variant = "rich",
  context,
}: {
  contacts: Contact[];
  className?: string;
  variant?: "plain" | "rich";
  context?: AccountContactContext;
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

  return (
    <div className={cn("space-y-2", className)}>
      {visible.map((contact) => {
        const why = contactWhy(contact, context);
        const angles = outreachAngles(contact, context);
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
                {contact.role === "primary" ? "Primary" : "Alt"}
              </span>
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
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
                  className="shrink-0 rounded-sm hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)]"
                  aria-label={`${contact.name} X profile`}
                >
                  <AtSign size={12} aria-hidden="true" />
                </a>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {contact.location && (
                <span
                  className="inline-flex min-w-0 items-center gap-0.5"
                  aria-label={`Location: ${contact.location}`}
                >
                  <MapPin size={11} aria-hidden="true" />
                  <span className="truncate">{contact.location}</span>
                </span>
              )}
            </div>

            {why && (
              <p className="leading-relaxed text-[var(--color-text-muted)]">
                <span className="font-medium text-[var(--color-text)]">
                  Why:
                </span>{" "}
                {why}
              </p>
            )}

            {angles.length > 0 && (
              <div className="space-y-0.5 leading-relaxed text-[var(--color-text-muted)]">
                <div className="font-medium text-[var(--color-text)]">
                  Angles
                </div>
                {angles.map((angle) => (
                  <div
                    key={angle}
                    className="flex gap-1.5"
                  >
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
