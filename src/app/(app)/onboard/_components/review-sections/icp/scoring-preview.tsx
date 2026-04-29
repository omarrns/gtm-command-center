"use client";

import { ReviewFormSection } from "@/components/ui/review-form-section";
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
  edits: IcpEdits;
}

export function ScoringPreview({ edits }: ScoringPreviewProps) {
  const f = edits.icp.firmographics;
  const t = edits.icp.technographics;
  const s = edits.icp.signals;
  const d = edits.icp.disqualifiers;

  return (
    <ReviewFormSection title="Scoring Rubric Preview">
      <div className="space-y-4 text-sm">
        <p className="text-xs text-[var(--color-text-muted)]">
          This is what gets written to your scoring profile. Discovery adapters
          (search queries, automated ICP matching) come in a follow-up release.
        </p>
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs text-[var(--color-text-muted)]">
              Firmographics
            </p>
            <p>
              {bullets(f.industries)} · {f.business_model || "(not set)"} ·{" "}
              {f.employee_range.min}–{f.employee_range.max ?? "unbounded"}{" "}
              employees · {bullets(f.stages)} · {bullets(f.geographies)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[var(--color-text-muted)]">
              Technographics
            </p>
            <p>
              Required: {bullets(t.required_tools)} · Excluded:{" "}
              {bullets(t.excluded_tools)} · Maturity:{" "}
              {t.tech_maturity || "(not set)"} · Data:{" "}
              {t.data_infrastructure || "(not set)"}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[var(--color-text-muted)]">Signals</p>
            <p>
              Hiring: {bullets(s.hiring_roles)} · JTBD:{" "}
              {bullets(s.jtbd_evidence)} · Triggers: {bullets(s.trigger_events)}{" "}
              · Pain: {bullets(s.pain_language)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-[var(--color-text-muted)]">
              Disqualifiers
            </p>
            <p>
              Tech: {bullets(d.tech_disqualifiers)} · Size:{" "}
              {d.size_disqualifiers || "(none)"} · Stage:{" "}
              {bullets(d.stage_disqualifiers)} · Behavioral:{" "}
              {bullets(d.behavioral_disqualifiers)}
            </p>
          </div>
        </div>
      </div>
    </ReviewFormSection>
  );
}
