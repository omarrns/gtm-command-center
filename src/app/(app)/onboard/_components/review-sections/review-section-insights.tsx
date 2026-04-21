import { Sparkles } from "lucide-react";
import type { ExtractionInsights } from "@/lib/onboarding/templates/job-search";

interface ReviewSectionInsightsProps {
  insights: ExtractionInsights;
}

export function ReviewSectionInsights({
  insights,
}: ReviewSectionInsightsProps) {
  if (!insights.career_narrative) return null;

  return (
    <div className="surface p-5 mb-4">
      <div className="flex items-center gap-1.5 mb-3">
        <Sparkles size={14} className="text-[var(--color-blue)]" />
        <h3 className="text-sm font-semibold">Coach Notes</h3>
      </div>
      <div className="space-y-3 text-sm text-[var(--color-text-muted)]">
        {insights.career_narrative && (
          <div>
            <p className="text-xs font-medium text-[var(--color-text)] mb-1">
              Career Narrative
            </p>
            <p>{insights.career_narrative}</p>
          </div>
        )}
        {insights.strongest_stories?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--color-text)] mb-1">
              Strongest Stories
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              {insights.strongest_stories.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {insights.decision_drivers?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-[var(--color-text)] mb-1">
              Decision Drivers
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              {insights.decision_drivers.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
        {insights.communication_style_notes && (
          <div>
            <p className="text-xs font-medium text-[var(--color-text)] mb-1">
              Communication Style
            </p>
            <p>{insights.communication_style_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
