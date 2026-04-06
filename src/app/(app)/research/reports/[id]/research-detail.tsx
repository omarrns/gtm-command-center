"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw, ExternalLink, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useJobPoll } from "@/lib/jobs/use-job-poll";
import { formatRelativeTime } from "@/lib/utils";
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
      <div className="flex items-center gap-3 mb-6">
        <Link href="/research" className="btn-ghost p-1.5 rounded-md">
          <ArrowLeft size={16} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold truncate">
            {initial.company_name} — {initial.role_title}
          </h2>
          <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
            <span className="badge">{initial.research_type}</span>{" "}
            {formatRelativeTime(initial.created_at)}
          </div>
        </div>
        {initial.status === "complete" && (
          <Link
            href={`/outreach/new`}
            className="btn-ghost border border-[var(--color-border)] flex items-center gap-1.5 text-xs"
          >
            <Mail size={13} /> Draft Outreach
          </Link>
        )}
      </div>

      {needsPolling && (
        <div className="surface-muted flex items-center gap-3 p-5 mb-6">
          <RefreshCw
            size={16}
            className="animate-spin text-[var(--color-accent)]"
          />
          <div>
            <div className="text-sm font-medium">Research running…</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Querying Exa and synthesizing. Usually completes within 120
              seconds.
            </div>
          </div>
        </div>
      )}

      {initial.status === "failed" && (
        <div className="surface p-5 mb-6 border-[var(--color-danger)]">
          <div className="text-sm font-medium text-[var(--color-danger)]">
            Research failed
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Bottom line */}
          {typeof result.bottom_line === "string" ? (
            <div className="surface-muted p-5">
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
                Bottom Line
              </div>
              <div className="text-sm leading-relaxed">
                {result.bottom_line}
              </div>
            </div>
          ) : null}

          {/* People cards */}
          {ceo ? <PersonCard label="CEO / Founder" person={ceo} /> : null}
          {hm ? <PersonCard label="Hiring Manager" person={hm} /> : null}

          {typeof result.recommended_first_contact === "string" ? (
            <div className="surface p-5">
              <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
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
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      </div>

      {person.career_history?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
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
            <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
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
          <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
            Personalization Angles
          </div>
          <ul className="text-xs text-[var(--color-text-muted)] space-y-1">
            {person.personalization_angles.map((a, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-[var(--color-accent)] font-bold">
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
          <div className="text-xs font-medium text-[var(--color-text-muted)] mb-1">
            Sources
          </div>
          <ul className="text-xs space-y-1">
            {person.sources.map((s, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-accent)] underline truncate max-w-[300px] inline-block"
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
