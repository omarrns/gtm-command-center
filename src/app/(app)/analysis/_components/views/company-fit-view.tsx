import { ScorecardPanel } from "../scorecard-panel";
import { isObj, type Obj } from "../result-guards";
import { CompanyOverviewPanel } from "./company-overview-panel";

export function CompanyFitView({ result }: { result: Obj }) {
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
