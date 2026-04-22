import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { ExtractionInsights } from "@/lib/onboarding/templates/job-search";

interface ReviewSectionInsightsProps {
  insights: ExtractionInsights;
}

export function ReviewSectionInsights({
  insights,
}: ReviewSectionInsightsProps) {
  if (!insights.career_narrative) return null;

  return (
    <ReviewFormSection title="Coach Notes">
      <div className="space-y-4 text-sm text-[var(--color-text-muted)]">
        {insights.career_narrative && (
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              Career Narrative
            </p>
            <p>{insights.career_narrative}</p>
          </div>
        )}
        {insights.strongest_stories?.length > 0 && (
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
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
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
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
            <p className="text-xs text-[var(--color-text-muted)] mb-1">
              Communication Style
            </p>
            <p>{insights.communication_style_notes}</p>
          </div>
        )}
      </div>
    </ReviewFormSection>
  );
}
