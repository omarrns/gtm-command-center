"use client";
import {
  Warning,
} from "@phosphor-icons/react/ssr";
import { Alert } from "@/components/ui/alert";
import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { IcpDisagreement } from "@/lib/onboarding/orchestrator/icp-disagreements";

// Section 6 of the ICP review. First-class visual treatment for
// dimensions where the user's declared statements clashed with what
// exemplars suggested. Hidden when the engine returns zero
// disagreements (most common case).

const SEVERITY_LABEL: Record<IcpDisagreement["severity"], string> = {
  high: "High",
  medium: "Medium",
};

interface DisagreementsProps {
  disagreements: IcpDisagreement[];
}

export function Disagreements({ disagreements }: DisagreementsProps) {
  if (disagreements.length === 0) return null;

  return (
    <ReviewFormSection title={`Disagreements (${disagreements.length})`}>
      <div className="space-y-3">
        <p className="text-xs text-[var(--color-text-muted)]">
          What you told us differs from what the exemplars showed. Worth a
          second look — edit the relevant section above to resolve.
        </p>
        {disagreements.map((d) => (
          <Alert
            key={d.dimensionKey}
            variant={d.severity === "high" ? "destructive" : "default"}
          >
            <Warning size={14} />
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{d.label}</p>
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-subtle)]">
                  {SEVERITY_LABEL[d.severity]} severity
                </span>
              </div>
              <p className="text-[var(--color-text-muted)]">{d.summary}</p>
              <p className="text-[var(--color-text-subtle)]">
                Declared: {d.declaredSources.join(", ")} · Inferred:{" "}
                {d.inferredSources.join(", ")}
              </p>
            </div>
          </Alert>
        ))}
      </div>
    </ReviewFormSection>
  );
}
