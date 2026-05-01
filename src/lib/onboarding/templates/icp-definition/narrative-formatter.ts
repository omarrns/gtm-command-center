import type { IcpNarrativeArc } from "@/lib/onboarding/icp-narrative-schema";

function cleanText(value: string): string {
  return value.trim();
}

function cleanList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function formatList(values: string[]): string {
  return values.map((value) => `- ${value}`).join("\n");
}

export function formatIcpNarrativeAsMarkdown(
  arc: IcpNarrativeArc | null,
): string | null {
  if (!arc) return null;

  const sections: string[] = [];
  const trigger = cleanText(arc.trigger);
  const failedWorkarounds = cleanList(arc.failed_workarounds);
  const stakes = cleanText(arc.stakes);
  const aha = cleanList(arc.aha);
  const decisionCriteria = cleanList(arc.decision_criteria);
  const identityShift = cleanText(arc.identity_shift);

  if (trigger) {
    sections.push(`## Trigger\n\n${trigger}`);
  }
  if (failedWorkarounds.length > 0) {
    sections.push(
      `## Failed Workarounds\n\n${formatList(failedWorkarounds)}`,
    );
  }
  if (stakes) {
    sections.push(`## Stakes\n\n${stakes}`);
  }
  if (aha.length > 0) {
    sections.push(`## Aha\n\n${formatList(aha)}`);
  }
  if (decisionCriteria.length > 0) {
    sections.push(
      `## Decision Criteria\n\n${formatList(decisionCriteria)}`,
    );
  }
  if (identityShift) {
    sections.push(`## Identity Shift\n\n${identityShift}`);
  }

  if (sections.length === 0) return null;
  return sections.join("\n\n---\n\n");
}
