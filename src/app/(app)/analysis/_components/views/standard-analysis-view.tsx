import { ScorecardPanel } from "../scorecard-panel";
import { RequirementTable } from "../requirement-table";
import { FlagCallout } from "../flag-callout";
import { isObj, renderIf, type Obj } from "../result-guards";

export function StandardAnalysisView({ result }: { result: Obj }) {
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
