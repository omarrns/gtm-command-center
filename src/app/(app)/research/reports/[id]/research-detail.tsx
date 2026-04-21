"use client";

import { useEffect } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useJobPoll } from "@/lib/jobs/use-job-poll";
import { formatRelativeTime } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { DetailHeader } from "@/components/detail-header";
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
        backHref="/"
        backLabel="Back to Today"
        title={`${initial.company_name} — ${initial.role_title}`}
        subtitle={
          <>
            <Badge variant="muted">{initial.research_type}</Badge>{" "}
            {formatRelativeTime(initial.created_at)}
          </>
        }
      />

      {needsPolling && (
        <Alert className="mb-6">
          <RefreshCw className="animate-spin text-[var(--color-blue)]" />
          <AlertTitle>Research running…</AlertTitle>
          <AlertDescription>
            Querying Exa and synthesizing. Usually completes within 120 seconds.
          </AlertDescription>
        </Alert>
      )}

      {initial.status === "failed" && (
        <Alert variant="destructive" className="mb-6">
          <AlertTitle>Research failed</AlertTitle>
        </Alert>
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
        <Badge variant="warning" className="mt-2">
          {person.confidence}
        </Badge>
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
          <Badge
            variant={
              person.confidence === "high"
                ? "success"
                : person.confidence === "medium"
                  ? "warning"
                  : "destructive"
            }
          >
            {person.confidence}
          </Badge>
          {person.linkedin && (
            <a
              href={person.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
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
                <Badge key={i} variant="muted">
                  {t}
                </Badge>
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
