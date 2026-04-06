import { AnalysisIntakeForm } from "../_components/analysis-intake-form";

export const metadata = { title: "JD Rubric · GTM Command Center" };

export default function JdRubricPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">JD Fit Rubric</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Paste a job description for a fast requirement-by-requirement match.
          No web research — just resume scoring.
        </p>
      </div>
      <AnalysisIntakeForm mode="jd-rubric" />
    </div>
  );
}
