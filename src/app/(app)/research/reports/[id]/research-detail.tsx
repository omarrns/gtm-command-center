"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ExternalLink, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useJobPoll } from "@/lib/jobs/use-job-poll";
import { formatRelativeTime } from "@/lib/utils";
import { DetailHeader } from "@/components/detail-header";
import { StatusBanner } from "@/components/status-banner";
import type { ResearchReportRow } from "@/lib/supabase/types";

interface PersonResult {
  identified: boolean;
  name: string | null;
  title: string | null;
  linkedin: string | null;
  career_history: string[];
  sources: Array<{ url: string; claim: string }>;
  confidence: string;
  personalization_angles: string[];
  public_writing_themes?: string[];
  worldview?: string | null;
}

export function ResearchDetail({
  report: initial,
}: {
  report: ResearchReportRow;
}) {
  const router = useRouter();
  const needsPolling =
    initial.status === "running" || initial.status === "pending";
  const { isComplete } = useJobPoll(needsPolling ? initial.job_id : null);

  useEffect(() => {
    if (isComplete && needsPolling) {
      router.refresh();
    }
  }, [isComplete, needsPolling, router]);

  const result = initial.result as Record<string, unknown> | null;
  const ceo = result?.ceo as PersonResult | undefined;
  const hm = result?.hiring_manager as PersonResult | undefined;

  return (
    <div className="max-w-4xl">
      <DetailHeader
        backHref="/research"
        backLabel="Back to research"
        title={`${initial.company_name} — ${initial.role_title}`}
        subtitle={
          <>
            <span className="badge">{initial.research_type}</span>{" "}
            {formatRelativeTime(initial.created_at)}
          </>
        }
      >
        {initial.status === "complete" && (
          <Link
            href="/outreach/new"
            className="btn-ghost border border-[var(--color-border)] flex items-center gap-1.5 text-xs"
          >
            <Mail size={14} /> Draft Outreach
          </Link>
        )}
      </DetailHeader>

      {needsPolling && (
        <StatusBanner
          status="running"
          title="Research running…"
          detail="Querying Exa and synthesizing. Usually completes within 120 seconds."
        />
      )}

      {initial.status === "failed" && (
        <StatusBanner status="failed" title="Research failed" />
      )}

      {/* Imported markdown fallback */}
      {result &&
        result.imported === true &&
        typeof result.raw_markdown === "string" && (
          <div className="space-y-6">
            <div className="surface p-6">
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)]">
                {String(result.raw_markdown)}
              </pre>
            </div>
          </div>
        )}

      {result && result.imported !== true && (
        <div className="space-y-6">
          {typeof result.bottom_line === "string" ? (
            <div className="surface-muted p-5 border-l-3 border-[var(--color-blue)]">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                Bottom Line
              </div>
              <div className="text-sm leading-relaxed max-w-prose">
                {result.bottom_line}
              </div>
            </div>
          ) : null}

          {ceo ? <PersonCard label="CEO / Founder" person={ceo} /> : null}
          {hm ? <PersonCard label="Hiring Manager" person={hm} /> : null}

          {typeof result.recommended_first_contact === "string" ? (
            <div className="surface p-5">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                Recommended First Contact
              </div>
              <div className="text-sm font-medium capitalize">
                {result.recommended_first_contact}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PersonCard({
  label,
  person,
}: {
  label: string;
  person: PersonResult;
}) {
  if (!person.identified) {
    return (
      <div className="surface p-5">
        <h3 className="text-sm font-semibold mb-2">{label}</h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          Not identified with sufficient confidence.
        </p>
        <span className="badge badge-warning mt-2">{person.confidence}</span>
      </div>
    );
  }

  return (
    <div className="surface p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">{label}</h3>
          <div className="text-base font-medium mt-0.5">{person.name}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {person.title}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`badge ${
              person.confidence === "high"
                ? "badge-success"
                : person.confidence === "medium"
                  ? "badge-warning"
                  : "badge-danger"
            }`}
          >
            {person.confidence}
          </span>
          {person.linkedin && (
            <a
              href={person.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost p-1 rounded"
              aria-label={`${person.name} LinkedIn profile`}
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>

      {person.career_history?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
            Career History
          </div>
          <ul className="text-xs text-[var(--color-text-muted)] space-y-0.5">
            {person.career_history.map((c, i) => (
              <li key={i}>• {c}</li>
            ))}
          </ul>
        </div>
      )}

      {person.public_writing_themes &&
        person.public_writing_themes.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
              Public Writing Themes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {person.public_writing_themes.map((t, i) => (
                <span key={i} className="badge">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

      {person.personalization_angles?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
            Personalization Angles
          </div>
          <ul className="text-xs text-[var(--color-text-muted)] space-y-1">
            {person.personalization_angles.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-[var(--color-blue)] font-bold">
                  {i + 1}.
                </span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {person.sources?.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
            Sources
          </div>
          <ul className="text-xs space-y-1">
            {person.sources.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-blue)] underline truncate max-w-[300px] inline-block"
                >
                  {new URL(s.url).hostname}
                </a>
                <span className="text-[var(--color-text-subtle)]">
                  {s.claim}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
