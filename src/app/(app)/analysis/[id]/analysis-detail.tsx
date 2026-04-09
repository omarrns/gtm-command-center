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

type Obj = Record<string, unknown>;

function renderIf(condition: unknown, node: ReactNode): ReactNode {
  return condition ? node : null;
}

function isObj(v: unknown): v is Obj {
  return v != null && typeof v === "object" && !Array.isArray(v);
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

  const result = initial.result as Obj | null;
  const isRunning = initial.status === "running";
  const isFailed = initial.status === "failed";

  const isImported = result?.imported === true;
  const isCompanyFit = initial.skill_slug === "company-fit-analyzer";

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

      {result && isImported && <ImportedMarkdownView result={result} />}

      {result && !isImported && isCompanyFit && (
        <CompanyFitView result={result} />
      )}

      {result && !isImported && !isCompanyFit && (
        <StandardAnalysisView result={result} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Imported markdown                                                 */
/* ------------------------------------------------------------------ */

function ImportedMarkdownView({ result }: { result: Obj }) {
  if (typeof result.raw_markdown !== "string") return null;

  return (
    <div className="space-y-6">
      {result.score != null || result.verdict != null ? (
        <div className="flex items-center gap-3">
          {result.score != null ? (
            <span className="badge">Score: {String(result.score)}</span>
          ) : null}
          {result.verdict != null ? (
            <span className="badge">{String(result.verdict)}</span>
          ) : null}
        </div>
      ) : null}
      <div className="surface p-6">
        <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed text-[var(--color-text-muted)]">
          {String(result.raw_markdown)}
        </pre>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Company-fit analyzer                                              */
/* ------------------------------------------------------------------ */

function CompanyFitView({ result }: { result: Obj }) {
  const bottomLine = result.bottom_line as string | undefined;
  const strategicFit = isObj(result.strategic_fit)
    ? (result.strategic_fit as Obj)
    : null;
  const totalFitScore =
    typeof result.total_fit_score === "number" ? result.total_fit_score : null;
  const verdict = typeof result.verdict === "string" ? result.verdict : null;
  const greenFlags = Array.isArray(result.green_flags)
    ? (result.green_flags as string[])
    : null;
  const redFlags = Array.isArray(result.red_flags)
    ? (result.red_flags as string[])
    : null;
  const outreachAngles = Array.isArray(result.outreach_angles)
    ? (result.outreach_angles as { angle: string; reasoning: string }[])
    : null;
  const recentSignals = Array.isArray(result.recent_signals)
    ? (result.recent_signals as string[])
    : null;
  const founderProfile = isObj(result.founder_profile)
    ? (result.founder_profile as {
        name?: string;
        background?: string;
        worldview?: string;
      })
    : null;

  return (
    <div className="space-y-6">
      {bottomLine && (
        <div className="surface-muted p-5 border-l-3 border-[var(--color-blue)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
            Bottom Line
          </div>
          <div className="text-sm leading-relaxed max-w-prose">
            {bottomLine}
          </div>
        </div>
      )}

      {strategicFit && totalFitScore !== null && verdict && (
        <ScorecardPanel
          scorecard={
            strategicFit as unknown as Record<
              string,
              { score: number; justification: string }
            >
          }
          totalScore={totalFitScore}
          maxScore={30}
          verdict={verdict}
        />
      )}

      <CompanyOverviewPanel result={result} />

      {founderProfile && (
        <div className="surface p-5">
          <h3 className="text-sm font-semibold mb-3">Founder Profile</h3>
          <div className="space-y-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {founderProfile.name && (
              <p>
                <strong>Name:</strong> {founderProfile.name}
              </p>
            )}
            {founderProfile.background && (
              <p>
                <strong>Background:</strong> {founderProfile.background}
              </p>
            )}
            {founderProfile.worldview && (
              <p>
                <strong>Worldview:</strong> {founderProfile.worldview}
              </p>
            )}
          </div>
        </div>
      )}

      {recentSignals && recentSignals.length > 0 && (
        <div className="surface p-5">
          <h3 className="text-sm font-semibold mb-3">Recent Signals</h3>
          <ul className="space-y-1.5">
            {recentSignals.map((signal, i) => (
              <li
                key={i}
                className="text-xs leading-relaxed text-[var(--color-text-muted)] flex items-start gap-2"
              >
                <span className="text-[var(--color-blue)] mt-px">&#x2022;</span>
                {signal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(greenFlags?.length || redFlags?.length) && (
        <div className="surface p-5">
          <h3 className="text-sm font-semibold mb-3">Flags</h3>
          <div className="space-y-2 text-xs leading-relaxed">
            {greenFlags?.map((f, i) => (
              <p key={`g-${i}`} className="text-[var(--color-green)]">
                + {f}
              </p>
            ))}
            {redFlags?.map((f, i) => (
              <p key={`r-${i}`} className="text-[var(--color-red)]">
                - {f}
              </p>
            ))}
          </div>
        </div>
      )}

      {outreachAngles && outreachAngles.length > 0 && (
        <div className="surface p-5">
          <h3 className="text-sm font-semibold mb-3">Outreach Angles</h3>
          <ul className="space-y-3">
            {outreachAngles.map((oa, i) => (
              <li
                key={i}
                className="text-xs leading-relaxed text-[var(--color-text-muted)]"
              >
                <span className="font-semibold text-[var(--color-text)]">
                  {oa.angle}
                </span>
                <br />
                {oa.reasoning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CompanyOverviewPanel({ result }: { result: Obj }) {
  const whatTheyDo = result.what_they_do as string | undefined;
  const stageAndFunding = result.stage_and_funding as string | undefined;
  const gtmMotion = result.gtm_motion as string | undefined;
  const marketPosition = result.market_position as string | undefined;

  if (!whatTheyDo && !stageAndFunding && !gtmMotion) return null;

  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold mb-3">Company Overview</h3>
      <div className="space-y-2 text-xs leading-relaxed text-[var(--color-text-muted)]">
        {whatTheyDo && (
          <p>
            <strong>What they do:</strong> {whatTheyDo}
          </p>
        )}
        {stageAndFunding && (
          <p>
            <strong>Stage & Funding:</strong> {stageAndFunding}
          </p>
        )}
        {gtmMotion && (
          <p>
            <strong>GTM Motion:</strong> {gtmMotion}
          </p>
        )}
        {marketPosition && (
          <p>
            <strong>Market Position:</strong> {marketPosition}
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Standard analysis (JD rubric / full analysis)                     */
/* ------------------------------------------------------------------ */

function StandardAnalysisView({ result }: { result: Obj }) {
  const bottomLine = (result.bottom_line as string) ?? null;

  const jdScorecard = result.scorecard as
    | Record<string, { score: number; justification: string }>
    | undefined;
  const jdTotal = (result.total_score as number) ?? null;
  const jdVerdict = (result.verdict as string) ?? null;
  const requirementMatches =
    (result.requirement_matches as Array<{
      requirement: string;
      status: "STRONG MATCH" | "PARTIAL MATCH" | "GAP";
      evidence: string;
      notes: string;
    }>) ?? null;
  const flags = (result.flags as Record<string, unknown>) ?? null;
  const positioning = (result.positioning_recommendations as string[]) ?? null;

  const jdFit = isObj(result.jd_fit) ? (result.jd_fit as Obj) : null;
  const strategicFit = isObj(result.strategic_fit)
    ? (result.strategic_fit as Obj)
    : null;
  const companyOverview = isObj(result.company_overview)
    ? (result.company_overview as Obj)
    : null;
  const outreachAngle = isObj(result.outreach_angle)
    ? (result.outreach_angle as Obj)
    : null;

  return (
    <div className="space-y-6">
      {bottomLine && (
        <div className="surface-muted p-5 border-l-3 border-[var(--color-blue)]">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
            Bottom Line
          </div>
          <div className="text-sm leading-relaxed max-w-prose">
            {bottomLine}
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
                { rating: "green" | "orange" | "red"; note: string } | string[]
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
                <strong>Bridge:</strong> {String(outreachAngle.bridge ?? "")}
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
  );
}
