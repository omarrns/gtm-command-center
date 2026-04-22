"use client";

import { SectionHeader } from "../../section-header";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";

// Section 7 of the ICP review. Read-only summary of the rubric that
// will be written to user_scoring_profiles.icp_rubric on confirm.
// Live-renders from the in-flight edit state so the user sees the
// effect of edits above without confirming first.
//
// Search queries are intentionally absent — automated discovery via
// Exa is deferred (docs/DEFERRED.md). The pipeline_config row written
// on confirm has empty search_queries by design.

function bullets(items: string[]): string {
  return items.length === 0 ? "(none)" : items.join(" · ");
}

interface ScoringPreviewProps {
  isExpanded: boolean;
  onToggle: () => void;
  edits: IcpEdits;
}

export function ScoringPreview({
  isExpanded,
  onToggle,
  edits,
}: ScoringPreviewProps) {
  const f = edits.icp.firmographics;
  const t = edits.icp.technographics;
  const s = edits.icp.signals;

  return (
    <div className="surface p-5 mb-4">
      <SectionHeader
        title="Scoring rubric preview"
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="mt-2 space-y-3 text-sm">
          <p className="text-xs text-[var(--color-text-muted)]">
            This is what gets written to your scoring profile. Discovery
            adapters (search queries, automated ICP matching) come in a
            follow-up release.
          </p>
          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Firmographics
              </p>
              <p>
                {bullets(f.industries)} · {f.employee_range_min}–
                {f.employee_range_max} employees · {bullets(f.stages)} ·{" "}
                {bullets(f.geographies)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Technographics
              </p>
              <p>
                Required: {bullets(t.required_tools)} · Excluded:{" "}
                {bullets(t.excluded_tools)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Signals
              </p>
              <p>
                Hiring: {bullets(s.hiring_roles)} · JTBD:{" "}
                {bullets(s.jtbd_evidence)} · Triggers:{" "}
                {bullets(s.trigger_events)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Disqualifiers
              </p>
              <p>{bullets(edits.icp.disqualifiers)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
