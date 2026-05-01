import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { extractSection } from "@/lib/onboarding/markdown";

export interface ArcBeats {
  trigger: string;
  stakes: string;
  identity_shift: string;
  failed_workarounds: string[];
  decision_criteria: string[];
  aha: string[];
}

export interface HookDerivation {
  primary: string;
  overlay: string[];
}

export function parseBullets(md: string): string[] {
  return md
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

export function extractArcBeats(arcMarkdown: string): ArcBeats {
  const failedWorkarounds = extractSection(arcMarkdown, "Failed Workarounds");
  const decisionCriteria = extractSection(arcMarkdown, "Decision Criteria");
  const aha = extractSection(arcMarkdown, "Aha");

  return {
    trigger: extractSection(arcMarkdown, "Trigger"),
    stakes: extractSection(arcMarkdown, "Stakes"),
    identity_shift: extractSection(arcMarkdown, "Identity Shift"),
    failed_workarounds: parseBullets(failedWorkarounds),
    decision_criteria: parseBullets(decisionCriteria),
    aha: parseBullets(aha),
  };
}

export function deriveColdEmailOpener(
  arc: ArcBeats,
  rubric: IcpRubric | null,
): HookDerivation {
  return {
    primary: arc.trigger.trim(),
    overlay: firstNonEmpty(rubric?.signals.pain_language, 2),
  };
}

export function deriveLandingHero(
  arc: ArcBeats,
  rubric: IcpRubric | null,
): HookDerivation {
  const wedge = rubric?.product.wedge.trim();
  return {
    primary: arc.identity_shift.trim(),
    overlay: wedge ? [wedge] : [],
  };
}

export function deriveAdConceptSeed(
  arc: ArcBeats,
  rubric: IcpRubric | null,
): HookDerivation {
  return {
    primary: arc.stakes.trim(),
    overlay: firstNonEmpty(rubric?.signals.trigger_events, 2),
  };
}

export function deriveSalesTalkTrack(arc: ArcBeats): HookDerivation {
  return {
    primary: firstNonEmpty(arc.failed_workarounds, 2).join("\n"),
    overlay: firstNonEmpty(arc.decision_criteria, 2),
  };
}

function firstNonEmpty(values: string[] | undefined, count: number): string[] {
  return (values ?? [])
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, count);
}
