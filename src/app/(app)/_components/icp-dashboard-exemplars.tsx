"use client";

import { Badge } from "@/components/ui/badge";
import { ReviewFormSection } from "@/components/ui/review-form-section";

// Read-only exemplar list rendered at the bottom of the GTM dashboard.
// Lives in a sibling file so icp-dashboard-fields.tsx stays under the
// 400-line cap; this section is self-contained display.

const KIND_LABEL: Record<string, string> = {
  positive_example: "Positive",
  negative_example: "Negative",
  buyer_persona: "Buyer persona",
  company_context: "Context",
};

export interface ExemplarSummary {
  id: string;
  kind: string;
  source_label: string | null;
  source_url: string | null;
  status: string;
}

interface IcpDashboardExemplarsProps {
  artifacts: ExemplarSummary[];
}

export function IcpDashboardExemplars({
  artifacts,
}: IcpDashboardExemplarsProps) {
  if (artifacts.length === 0) return null;
  return (
    <ReviewFormSection title={`Exemplars (${artifacts.length})`}>
      <div className="space-y-3">
        {artifacts.map((artifact) => {
          const title =
            artifact.source_label ?? artifact.source_url ?? "Untitled";
          return (
            <div key={artifact.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm text-[var(--color-text)]">{title}</p>
                <Badge variant="muted">
                  {KIND_LABEL[artifact.kind] ?? artifact.kind}
                </Badge>
              </div>
              {artifact.source_url && (
                <a
                  href={artifact.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[var(--color-blue)] hover:underline"
                >
                  {artifact.source_url}
                </a>
              )}
            </div>
          );
        })}
      </div>
    </ReviewFormSection>
  );
}
