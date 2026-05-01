import type { IcpNarrativeArc } from "@/lib/onboarding/icp-narrative-schema";

const EMPTY_ARC: IcpNarrativeArc = {
  trigger: "",
  failed_workarounds: [],
  stakes: "",
  aha: [],
  decision_criteria: [],
  identity_shift: "",
};

const SECTION_KEYS = {
  Trigger: "trigger",
  "Failed Workarounds": "failed_workarounds",
  Stakes: "stakes",
  Aha: "aha",
  "Decision Criteria": "decision_criteria",
  "Identity Shift": "identity_shift",
} as const satisfies Record<string, keyof IcpNarrativeArc>;

const LIST_KEYS = new Set<keyof IcpNarrativeArc>([
  "failed_workarounds",
  "aha",
  "decision_criteria",
]);

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

export function parseIcpNarrativeMarkdown(content: string | null): IcpNarrativeArc {
  const markdown = content?.trim() ?? "";
  if (!markdown) return { ...EMPTY_ARC };

  const next: IcpNarrativeArc = { ...EMPTY_ARC };
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  if (headings.length === 0) {
    return { ...next, trigger: markdown };
  }

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const title = heading[1]?.trim() ?? "";
    const key = SECTION_KEYS[title as keyof typeof SECTION_KEYS];
    if (!key) continue;

    const nextHeading = headings[index + 1];
    const start = (heading.index ?? 0) + heading[0].length;
    const end = nextHeading?.index ?? markdown.length;
    const body = markdown.slice(start, end).replace(/\n---\s*$/g, "").trim();

    assignNarrativeSection(next, key, body);
  }

  return next;
}

function assignNarrativeSection(
  arc: IcpNarrativeArc,
  key: keyof IcpNarrativeArc,
  body: string,
) {
  if (LIST_KEYS.has(key)) {
    const value = parseMarkdownList(body);
    if (key === "failed_workarounds") arc.failed_workarounds = value;
    if (key === "aha") arc.aha = value;
    if (key === "decision_criteria") arc.decision_criteria = value;
    return;
  }

  const value = cleanText(body);
  if (key === "trigger") arc.trigger = value;
  if (key === "stakes") arc.stakes = value;
  if (key === "identity_shift") arc.identity_shift = value;
}

function parseMarkdownList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "---")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}
