import { strict as assert } from "node:assert";
import {
  deriveAdConceptSeed,
  deriveColdEmailOpener,
  deriveLandingHero,
  deriveSalesTalkTrack,
  extractArcBeats,
  parseBullets,
  parseMarkdownBlocks,
  type ArcBeats,
} from "../src/app/(app)/gtm/messaging/_components/messaging-hub-helpers";

const arcMarkdown = [
  "## Trigger",
  "",
  "A new VP Sales inherited a stalled outbound motion.",
  "",
  "---",
  "",
  "## Failed Workarounds",
  "",
  "- Hire another contractor",
  "- Stretch the existing CRM",
  "- Ignore the reporting gap",
  "",
  "---",
  "",
  "## Stakes",
  "",
  "Missed pipeline targets are now visible to the board.",
  "",
  "---",
  "",
  "## Aha",
  "",
  "- It is a category problem",
  "",
  "---",
  "",
  "## Decision Criteria",
  "",
  "- Fast setup",
  "- Native CRM fit",
  "- Clear attribution",
  "",
  "---",
  "",
  "## Identity Shift",
  "",
  "The GTM lead becomes the person who spots pipeline risk early.",
].join("\n");

const rubric = {
  product: {
    category: "Outbound intelligence",
    core_jtbd: "Find in-market accounts",
    wedge: "Fastest account-to-draft workflow for lean GTM teams",
    delivery_model: "SaaS",
  },
  buyer: {
    economic_buyer: "VP Sales",
    champion: "Revenue Operations",
    end_user: "SDR Manager",
    deal_blocker: "Security",
  },
  firmographics: {
    industries: [],
    business_model: "",
    employee_range: { min: 0, max: 10000 },
    stages: [],
    geographies: [],
  },
  technographics: {
    required_tools: [],
    excluded_tools: [],
    tech_maturity: "",
    data_infrastructure: "",
  },
  signals: {
    hiring_roles: [],
    jtbd_evidence: [],
    trigger_events: ["New VP Sales", "Pipeline miss", "Board pressure"],
    pain_language: ["low pipeline coverage", "manual account research", "CRM sprawl"],
  },
  disqualifiers: {
    tech_disqualifiers: [],
    size_disqualifiers: "",
    stage_disqualifiers: [],
    behavioral_disqualifiers: [],
  },
  proof_points: {
    existing_customers: [],
    won_deals: [],
    lost_deals_reasons: [],
  },
  evidence: {},
} as unknown as NonNullable<Parameters<typeof deriveColdEmailOpener>[1]>;

assert.deepEqual(
  parseBullets(["- first", "not a bullet", " - second  ", "-", "-   "].join("\n")),
  ["first", "second"],
  "parseBullets parses simple bullets and ignores non-bullets",
);
assert.deepEqual(parseBullets(""), [], "parseBullets returns empty array");
assert.deepEqual(
  parseMarkdownBlocks(
    ["## Product", "", "- **Category**: Agentic GTM", "", "---", "", "## Buyer", "", "VP Sales"].join(
      "\n",
    ),
  ),
  [
    { title: "Product", body: "- **Category**: Agentic GTM" },
    { title: "Buyer", body: "VP Sales" },
  ],
  "parseMarkdownBlocks returns titled sections",
);
assert.deepEqual(
  parseMarkdownBlocks("Standalone note"),
  [{ title: "Notes", body: "Standalone note" }],
  "parseMarkdownBlocks handles markdown without headings",
);
assert.deepEqual(
  parseMarkdownBlocks("   "),
  [],
  "parseMarkdownBlocks returns empty array for whitespace-only input",
);

const arc = extractArcBeats(arcMarkdown);
assert.equal(
  arc.trigger,
  "A new VP Sales inherited a stalled outbound motion.",
  "extractArcBeats parses trigger",
);
assert.deepEqual(
  arc.failed_workarounds,
  ["Hire another contractor", "Stretch the existing CRM", "Ignore the reporting gap"],
  "extractArcBeats parses failed workarounds",
);
assert.equal(
  arc.stakes,
  "Missed pipeline targets are now visible to the board.",
  "extractArcBeats parses stakes",
);
assert.deepEqual(
  arc.decision_criteria,
  ["Fast setup", "Native CRM fit", "Clear attribution"],
  "extractArcBeats parses decision criteria",
);
assert.equal(
  arc.identity_shift,
  "The GTM lead becomes the person who spots pipeline risk early.",
  "extractArcBeats parses identity shift",
);

const emptyArc = extractArcBeats("## Trigger\n\n   ");
assert.deepEqual(
  emptyArc,
  {
    trigger: "",
    stakes: "",
    identity_shift: "",
    failed_workarounds: [],
    decision_criteria: [],
    aha: [],
  },
  "extractArcBeats returns empty primitives for missing sections",
);

assert.deepEqual(
  deriveColdEmailOpener(arc, rubric),
  {
    primary: "A new VP Sales inherited a stalled outbound motion.",
    overlay: ["low pipeline coverage", "manual account research"],
  },
  "deriveColdEmailOpener returns trigger and pain language",
);
assert.deepEqual(
  deriveColdEmailOpener(arc, null).overlay,
  [],
  "deriveColdEmailOpener degrades without rubric",
);

assert.deepEqual(
  deriveLandingHero(arc, rubric),
  {
    primary: "The GTM lead becomes the person who spots pipeline risk early.",
    overlay: ["Fastest account-to-draft workflow for lean GTM teams"],
  },
  "deriveLandingHero returns identity shift and wedge",
);
assert.deepEqual(
  deriveLandingHero(arc, { ...rubric, product: { ...rubric.product, wedge: "" } }),
  {
    primary: "The GTM lead becomes the person who spots pipeline risk early.",
    overlay: [],
  },
  "deriveLandingHero degrades without wedge",
);

assert.deepEqual(
  deriveAdConceptSeed(arc, rubric),
  {
    primary: "Missed pipeline targets are now visible to the board.",
    overlay: ["New VP Sales", "Pipeline miss"],
  },
  "deriveAdConceptSeed returns stakes and trigger events",
);
assert.deepEqual(
  deriveAdConceptSeed(arc, {
    ...rubric,
    signals: { ...rubric.signals, trigger_events: ["New CRO"] },
  }).overlay,
  ["New CRO"],
  "deriveAdConceptSeed handles fewer than two trigger events",
);

assert.deepEqual(
  deriveSalesTalkTrack(arc),
  {
    primary: "Hire another contractor\nStretch the existing CRM",
    overlay: ["Fast setup", "Native CRM fit"],
  },
  "deriveSalesTalkTrack returns workarounds and decision criteria",
);

const whitespaceArc: ArcBeats = {
  trigger: " ",
  stakes: " ",
  identity_shift: " ",
  failed_workarounds: [" "],
  decision_criteria: [" "],
  aha: [],
};
assert.equal(
  deriveColdEmailOpener(whitespaceArc, null).primary,
  "",
  "deriveColdEmailOpener trims whitespace-only primary",
);
assert.equal(
  deriveLandingHero(whitespaceArc, null).primary,
  "",
  "deriveLandingHero trims whitespace-only primary",
);
assert.equal(
  deriveAdConceptSeed(whitespaceArc, null).primary,
  "",
  "deriveAdConceptSeed trims whitespace-only primary",
);
assert.deepEqual(
  deriveSalesTalkTrack(whitespaceArc),
  { primary: "", overlay: [] },
  "deriveSalesTalkTrack trims whitespace-only values",
);

console.log("PASS: messaging hub helpers");
