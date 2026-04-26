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

function summarizeMatchReasons(
  reasons: WebsetMatchReason[] | null | undefined,
): string | null {
  if (!reasons || reasons.length === 0) return null;
  const positives = reasons
    .filter((r) => r.satisfied === "yes" && r.reasoning?.trim())
    .map((r) => `• ${r.reasoning.trim()}`);
  return positives.length > 0 ? positives.join("\n") : null;
}

export function ContactPanel({
  contacts,
  className,
  variant = "rich",
}: {
  contacts: Contact[];
  className?: string;
  variant?: "plain" | "rich";
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
    <div className={cn("space-y-1.5", className)}>
      {visible.map((contact) => {
        const matchTooltip = summarizeMatchReasons(contact.matchReasons);
        return (
          <div
            key={`${contact.role}-${contact.name}`}
            className="flex min-w-0 items-center gap-2 text-xs text-[var(--color-text-subtle)]"
          >
            {contact.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.pictureUrl}
                alt=""
                title={matchTooltip ?? undefined}
                className="h-5 w-5 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                title={matchTooltip ?? undefined}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-muted)]"
              >
                <UserRound size={12} aria-hidden="true" />
              </span>
            )}
            <span className="min-w-0 truncate">
              <span className="text-[var(--color-text)]">{contact.name}</span>
              {contact.title && ` · ${contact.title}`}
            </span>
            {contact.location && (
              <span
                className="shrink-0 inline-flex items-center gap-0.5 text-[var(--color-text-subtle)]"
                aria-label={`Location: ${contact.location}`}
              >
                <MapPin size={11} aria-hidden="true" />
                {contact.location}
              </span>
            )}
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
        );
      })}
    </div>
  );
}
