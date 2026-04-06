import { AnalysisIntakeForm } from "../_components/analysis-intake-form";

export const metadata = { title: "Company Analysis · GTM Command Center" };

export default function CompanyAnalysisPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Company Fit Analyzer</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Enter a company name for strategic fit research — market positioning,
          founder profile, and outreach angles. No JD required.
        </p>
      </div>
      <AnalysisIntakeForm mode="company" />
    </div>
  );
}
