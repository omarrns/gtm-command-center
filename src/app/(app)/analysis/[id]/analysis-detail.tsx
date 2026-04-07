"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useJobPoll } from "@/lib/jobs/use-job-poll";
import { ScorecardPanel } from "../_components/scorecard-panel";
import { RequirementTable } from "../_components/requirement-table";
import { FlagCallout } from "../_components/flag-callout";
import { formatRelativeTime } from "@/lib/utils";
import { DetailHeader } from "@/components/detail-header";
import { StatusBanner } from "@/components/status-banner";
import type { AnalysisRow } from "@/lib/supabase/types";
import type { ReactNode } from "react";

function renderIf(condition: unknown, node: ReactNode): ReactNode {
  return condition ? node : null;
}

export function AnalysisDetail({
  analysis: initial,
}: {
  analysis: AnalysisRow;
}) {
  const router = useRouter();
  const needsPolling =
    initial.status === "running" || initial.status === "draft";
  const { job, isComplete } = useJobPoll(needsPolling ? initial.job_id : null);

  useEffect(() => {
    if (isComplete && needsPolling) {
      router.refresh();
    }
  }, [isComplete, needsPolling, router]);

  const result = initial.result as Record<string, unknown> | null;
  const isRunning = initial.status === "running";
  const isFailed = initial.status === "failed";

  const jdScorecard = result?.scorecard as
    | Record<string, { score: number; justification: string }>
    | undefined;
  const jdTotal = (result?.total_score as number) ?? null;
  const jdVerdict = (result?.verdict as string) ?? null;
  const requirementMatches =
    (result?.requirement_matches as Array<{
      requirement: string;
      status: "STRONG MATCH" | "PARTIAL MATCH" | "GAP";
      evidence: string;
      notes: string;
    }>) ?? null;
  const flags = (result?.flags as Record<string, unknown>) ?? null;
  const positioning = (result?.positioning_recommendations as string[]) ?? null;
  const bottomLine = (result?.bottom_line as string) ?? null;

  type Obj = Record<string, unknown>;
  const jdFit: Obj | null =
    result?.jd_fit && typeof result.jd_fit === "object"
      ? (result.jd_fit as Obj)
      : null;
  const strategicFit: Obj | null =
    result?.strategic_fit && typeof result.strategic_fit === "object"
      ? (result.strategic_fit as Obj)
      : null;
  const companyOverview: Obj | null =
    result?.company_overview && typeof result.company_overview === "object"
      ? (result.company_overview as Obj)
      : null;
  const outreachAngle: Obj | null =
    result?.outreach_angle && typeof result.outreach_angle === "object"
      ? (result.outreach_angle as Obj)
      : null;

  return (
    <div className="max-w-4xl">
      <DetailHeader
        backHref="/"
        backLabel="Back to Today"
        title={`${initial.company_name ?? "Analysis"} ${initial.role_title ? `— ${initial.role_title}` : ""}`}
        subtitle={
          <>
            <span className="badge">{initial.skill_slug}</span>{" "}
            {formatRelativeTime(initial.created_at)}
          </>
        }
      />

      {isRunning && (
        <StatusBanner
          status="running"
          title="Analysis running…"
          detail="Researching company and synthesizing results. This usually takes 60–90 seconds."
        />
      )}

      {isFailed && (
        <StatusBanner
          status="failed"
          title="Analysis failed"
          detail={job?.error ?? "Unknown error. Check logs."}
        />
      )}

      {/* Imported markdown fallback */}
      {result &&
        (result as Record<string, unknown>).imported === true &&
        typeof (result as Record<string, unknown>).raw_markdown ===
          "string" && (
          <div className="space-y-6">
            {(result as Record<string, unknown>).score ||
            (result as Record<string, unknown>).verdict ? (
              <div className="flex items-center gap-3">
                {(result as Record<string, unknown>).score ? (
                  <span className="badge">
                    Score: {String((result as Record<string, unknown>).score)}
                  </span>
                ) : null}
                {(result as Record<string, unknown>).verdict ? (
                  <span className="badge">
                    {String((result as Record<string, unknown>).verdict)}
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className="surface p-6">
              <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)]">
                {String((result as Record<string, unknown>).raw_markdown)}
              </pre>
            </div>
          </div>
        )}

      {result && (result as Record<string, unknown>).imported !== true && (
        <div className="space-y-6">
          {(bottomLine || (result.bottom_line as string)) && (
            <div className="surface-muted p-5 border-l-3 border-[var(--color-blue)]">
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                Bottom Line
              </div>
              <div className="text-sm leading-relaxed max-w-prose">
                {bottomLine ?? (result.bottom_line as string)}
              </div>
            </div>
          )}

          {jdScorecard && jdTotal !== null && jdVerdict && (
            <ScorecardPanel
              scorecard={jdScorecard}
              totalScore={jdTotal}
              maxScore={35}
              verdict={jdVerdict}
            />
          )}

          {renderIf(
            jdFit,
            jdFit && (
              <ScorecardPanel
                scorecard={
                  jdFit.scorecard as Record<
                    string,
                    { score: number; justification: string }
                  >
                }
                totalScore={jdFit.total_score as number}
                maxScore={35}
                verdict={jdFit.verdict as string}
              />
            ),
          )}

          {renderIf(
            strategicFit,
            strategicFit && (
              <ScorecardPanel
                scorecard={
                  strategicFit.scorecard as Record<
                    string,
                    { score: number; justification: string }
                  >
                }
                totalScore={strategicFit.total_score as number}
                maxScore={30}
                verdict={strategicFit.verdict as string}
              />
            ),
          )}

          {requirementMatches && requirementMatches.length > 0 && (
            <RequirementTable matches={requirementMatches} />
          )}
          {renderIf(
            jdFit?.requirement_matches,
            <RequirementTable
              matches={
                (jdFit?.requirement_matches ?? []) as Array<{
                  requirement: string;
                  status: "STRONG MATCH" | "PARTIAL MATCH" | "GAP";
                  evidence: string;
                  notes: string;
                }>
              }
            />,
          )}

          {renderIf(
            flags,
            flags && (
              <FlagCallout
                flags={
                  flags as Record<
                    string,
                    | { rating: "green" | "orange" | "red"; note: string }
                    | string[]
                  >
                }
              />
            ),
          )}

          {renderIf(
            companyOverview,
            companyOverview && (
              <div className="surface p-5">
                <h3 className="text-sm font-semibold mb-3">Company Overview</h3>
                <div className="space-y-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
                  <p>
                    <strong>What they do:</strong>{" "}
                    {String(companyOverview.what_they_do ?? "")}
                  </p>
                  <p>
                    <strong>Stage & Funding:</strong>{" "}
                    {String(companyOverview.stage_and_funding ?? "")}
                  </p>
                  <p>
                    <strong>GTM Motion:</strong>{" "}
                    {String(companyOverview.gtm_motion ?? "")}
                  </p>
                </div>
              </div>
            ),
          )}

          {renderIf(
            outreachAngle,
            outreachAngle && (
              <div className="surface p-5">
                <h3 className="text-sm font-semibold mb-3">Outreach Angle</h3>
                <div className="space-y-2 text-xs leading-relaxed">
                  <p>
                    <strong>Hook:</strong> {String(outreachAngle.hook ?? "")}
                  </p>
                  <p>
                    <strong>Bridge:</strong>{" "}
                    {String(outreachAngle.bridge ?? "")}
                  </p>
                  <p>
                    <strong>Ask:</strong> {String(outreachAngle.ask ?? "")}
                  </p>
                </div>
              </div>
            ),
          )}

          {positioning && positioning.length > 0 && (
            <div className="surface p-5">
              <h3 className="text-sm font-semibold mb-3">
                Positioning Recommendations
              </h3>
              <ul className="space-y-2">
                {positioning.map((rec, i) => (
                  <li
                    key={i}
                    className="text-xs leading-relaxed text-[var(--color-text-muted)] flex items-start gap-2"
                  >
                    <span className="text-[var(--color-blue)] font-bold mt-px">
                      {i + 1}.
                    </span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
