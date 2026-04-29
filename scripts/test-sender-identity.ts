/**
 * Phase 9 PR1 runtime verification — test-sender-identity.ts
 *
 * Builds every converted system prompt from synthetic SenderIdentity objects
 * and asserts:
 *   (a) output contains the synthetic sender name, NOT "Omar" or "Inkeep"
 *   (b) output is non-empty and well-formed
 *   (c) null-optional fields produce coherent prompts without empty interpolations
 *
 * Usage:
 *   npx tsx scripts/test-sender-identity.ts
 */

import { buildEmailB2bCustomerSupportSystem } from "../src/lib/skills/prompts/email-b2b-customer-support";
import { buildFullAnalysisSystem } from "../src/lib/skills/prompts/full-analysis";
import { buildJdFitRubricSystem } from "../src/lib/skills/prompts/jd-fit-rubric";
import { buildCompanyFitAnalyzerSystem } from "../src/lib/skills/prompts/company-fit-analyzer";
import { buildCareerCoachSystem } from "../src/lib/skills/prompts/career-coach";
import { buildPeopleResearchSystem } from "../src/lib/skills/prompts/people-research";
import { buildCreatePromptSystem } from "../src/lib/skills/prompts/create-prompt";
import { buildCreateSkillSystem } from "../src/lib/skills/prompts/create-skill";
import type { SenderIdentity } from "../src/lib/skills/sender-identity";

// ── Test fixtures ──

const POPULATED_SENDER: SenderIdentity = {
  firstName: "Jane",
  fullName: "Jane Doe",
  positioning: "Growth engineer who builds data pipelines that drive revenue.",
  tools: ["HubSpot", "Segment", "PostHog", "dbt"],
  proofPoints: [
    "Built attribution pipeline: 200K+ tracked events/day",
    "Grew inbound 3x in 6 months via programmatic content",
  ],
  outreachTone: "casual",
  recentCompany: "Acme Corp",
  recentCompanyDescriptor: "B2B SaaS, ~50 people",
  recentRole: "Built the growth engine",
  domainInsiderClaim: "selling to the same buyer in the same market",
  signOff: "Jane",
};

const NULL_OPTIONAL_SENDER: SenderIdentity = {
  firstName: "Alex",
  fullName: "Alex Smith",
  positioning: "GTM engineer focused on automation and pipeline tooling.",
  tools: ["Apollo", "Sendgrid"],
  proofPoints: ["Automated outbound for 3 startups"],
  outreachTone: "direct",
  recentCompany: null,
  recentCompanyDescriptor: null,
  recentRole: null,
  domainInsiderClaim: null,
  signOff: "Alex",
};

const FALLBACK_SENDER: SenderIdentity = {
  firstName: "there",
  fullName: "the sender",
  positioning: "Builder looking for the next growth role.",
  tools: [],
  proofPoints: [],
  outreachTone: "formal",
  recentCompany: null,
  recentCompanyDescriptor: null,
  recentRole: null,
  domainInsiderClaim: null,
  signOff: "Best",
};

// ── All builders to test ──

const BUILDERS: Array<{
  name: string;
  build: (s: SenderIdentity) => string;
  usesRecentCompany: boolean; // Only email/analysis prompts reference sender.recentCompany
}> = [
  {
    name: "emailB2bCustomerSupport",
    build: buildEmailB2bCustomerSupportSystem,
    usesRecentCompany: true,
  },
  {
    name: "fullAnalysis",
    build: buildFullAnalysisSystem,
    usesRecentCompany: true,
  },
  {
    name: "jdFitRubric",
    build: buildJdFitRubricSystem,
    usesRecentCompany: true,
  },
  {
    name: "companyFitAnalyzer",
    build: buildCompanyFitAnalyzerSystem,
    usesRecentCompany: false,
  },
  {
    name: "careerCoach",
    build: buildCareerCoachSystem,
    usesRecentCompany: false,
  },
  {
    name: "peopleResearch",
    build: buildPeopleResearchSystem,
    usesRecentCompany: false,
  },
  {
    name: "createPrompt",
    build: buildCreatePromptSystem,
    usesRecentCompany: false,
  },
  {
    name: "createSkill",
    build: buildCreateSkillSystem,
    usesRecentCompany: false,
  },
];

const SENDERS: Array<{ label: string; sender: SenderIdentity }> = [
  { label: "populated", sender: POPULATED_SENDER },
  { label: "null-optional", sender: NULL_OPTIONAL_SENDER },
  { label: "fallback-minimal", sender: FALLBACK_SENDER },
];

// ── Test runner ──

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

console.log("Phase 9 — SenderIdentity runtime verification\n");

for (const { name, build, usesRecentCompany } of BUILDERS) {
  for (const { label, sender } of SENDERS) {
    const tag = `${name} [${label}]`;
    let output: string;

    try {
      output = build(sender);
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${tag} — threw: ${err}`);
      continue;
    }

    // (a) Non-empty
    assert(
      output.length > 50,
      `${tag}: output is non-empty (got ${output.length} chars)`,
    );

    // (b) No Omar/Inkeep leakage
    assert(!output.includes("Omar"), `${tag}: output must not contain "Omar"`);
    assert(
      !output.includes("Inkeep"),
      `${tag}: output must not contain "Inkeep"`,
    );

    // (c) Contains the sender's name when populated
    if (sender.fullName !== "the sender") {
      assert(
        output.includes(sender.fullName),
        `${tag}: output should contain "${sender.fullName}"`,
      );
    }

    // (d) Populated sender should reference their company (only in builders that use it)
    if (sender.recentCompany && usesRecentCompany) {
      assert(
        output.includes(sender.recentCompany),
        `${tag}: output should contain "${sender.recentCompany}"`,
      );
    }

    // (e) No empty interpolation artifacts (doubled spaces, empty quotes, etc.)
    assert(!output.includes('""'), `${tag}: no empty string interpolations`);
    assert(
      !/\b\s{3,}\b/.test(output),
      `${tag}: no triple-space gaps from empty interpolations`,
    );
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error("\nVerification FAILED — see errors above.");
  process.exit(1);
} else {
  console.log("All checks passed.");
}
