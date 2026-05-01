import { strict as assert } from "node:assert";
import { formatIcpNarrativeAsMarkdown } from "../narrative-formatter";
import type { IcpNarrativeArc } from "@/lib/onboarding/icp-narrative-schema";

const EMPTY_ARC: IcpNarrativeArc = {
  trigger: "",
  failed_workarounds: [],
  stakes: "",
  aha: [],
  decision_criteria: [],
  identity_shift: "",
};

function arc(overrides: Partial<IcpNarrativeArc>): IcpNarrativeArc {
  return { ...EMPTY_ARC, ...overrides };
}

function assertEqual(actual: string | null, expected: string | null) {
  assert.equal(actual, expected);
}

assertEqual(
  formatIcpNarrativeAsMarkdown(
    arc({
      trigger: "A new VP Sales inherited a stalled outbound motion.",
      failed_workarounds: ["Added more SDR meetings", "Stretched Salesforce"],
      stakes: "Missed pipeline targets are now visible to the board.",
      aha: ["The team sees this as a workflow problem"],
      decision_criteria: ["Fast setup", "Fits the current sales stack"],
      identity_shift: "The buyer becomes the revenue leader who fixed pipeline quality.",
    }),
  ),
  [
    "## Trigger\n\nA new VP Sales inherited a stalled outbound motion.",
    "## Failed Workarounds\n\n- Added more SDR meetings\n- Stretched Salesforce",
    "## Stakes\n\nMissed pipeline targets are now visible to the board.",
    "## Aha\n\n- The team sees this as a workflow problem",
    "## Decision Criteria\n\n- Fast setup\n- Fits the current sales stack",
    "## Identity Shift\n\nThe buyer becomes the revenue leader who fixed pipeline quality.",
  ].join("\n\n---\n\n"),
);

assertEqual(formatIcpNarrativeAsMarkdown(EMPTY_ARC), null);

assertEqual(
  formatIcpNarrativeAsMarkdown(
    arc({
      trigger: "Growth goals outpaced the team's manual research capacity.",
      stakes: "Every missed account delays the pipeline plan.",
      identity_shift: "The buyer becomes a more precise GTM operator.",
    }),
  ),
  [
    "## Trigger\n\nGrowth goals outpaced the team's manual research capacity.",
    "## Stakes\n\nEvery missed account delays the pipeline plan.",
    "## Identity Shift\n\nThe buyer becomes a more precise GTM operator.",
  ].join("\n\n---\n\n"),
);

assertEqual(
  formatIcpNarrativeAsMarkdown(
    arc({
      failed_workarounds: ["Spreadsheet queues", "More manual list building"],
      aha: ["They realize the data handoff is the bottleneck"],
      decision_criteria: ["Evidence quality", "Low workflow disruption"],
    }),
  ),
  [
    "## Failed Workarounds\n\n- Spreadsheet queues\n- More manual list building",
    "## Aha\n\n- They realize the data handoff is the bottleneck",
    "## Decision Criteria\n\n- Evidence quality\n- Low workflow disruption",
  ].join("\n\n---\n\n"),
);

assertEqual(
  formatIcpNarrativeAsMarkdown(
    arc({
      failed_workarounds: ["", "  ", "Weekly pipeline review"],
      aha: ["  ", "The pain is repeatable across segments"],
      decision_criteria: [],
    }),
  ),
  [
    "## Failed Workarounds\n\n- Weekly pipeline review",
    "## Aha\n\n- The pain is repeatable across segments",
  ].join("\n\n---\n\n"),
);

assertEqual(
  formatIcpNarrativeAsMarkdown(
    arc({
      trigger: "  ",
      stakes: "\n\t",
      identity_shift: "  ",
    }),
  ),
  null,
);

console.log("PASS: narrative formatter");
