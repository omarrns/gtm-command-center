import { strict as assert } from "node:assert";
import {
  buildIcpAccountOutreachPrompt,
  buildIcpAccountOutreachSystem,
} from "../src/lib/skills/prompts/icp-account-outreach";
import {
  GTM_DRAFT_PRIVACY_GUARD,
  pickPrimaryBuyerPersona,
} from "../src/lib/pipeline/steps/draft-gtm";
import type { SenderIdentity } from "../src/lib/skills/sender-identity";

const sender: SenderIdentity = {
  firstName: "Jane",
  fullName: "Jane Doe",
  positioning: "GTM engineer building account research systems for lean teams.",
  tools: ["HubSpot", "PostHog"],
  proofPoints: ["Built a pipeline engine for 400 target accounts"],
  outreachTone: "direct",
  recentCompany: null,
  recentCompanyDescriptor: null,
  recentRole: null,
  domainInsiderClaim: null,
  signOff: "Jane",
};

const narrativeArc = [
  "## Trigger",
  "",
  "A new VP Sales inherited a stalled outbound motion.",
  "",
  "---",
  "",
  "## Stakes",
  "",
  "Missed pipeline targets are now visible to the board.",
].join("\n");

const rubricBuyer = {
  economic_buyer: "VP Sales",
  champion: "Revenue Operations",
  end_user: "SDR Manager",
};

const persona = {
  name: "Maya Chen",
  title: "VP Revenue Operations",
  description: "Owns board-visible pipeline quality.",
};

const system = buildIcpAccountOutreachSystem(sender) + GTM_DRAFT_PRIVACY_GUARD;
const prompt = buildIcpAccountOutreachPrompt({
  companyName: "Northstar Revenue",
  companyDomain: "northstar-revenue.example",
  persona,
  narrativeArcMarkdown: narrativeArc,
  rubricBuyer,
  senderProfile: "Jane builds revenue automation for lean GTM teams.",
  outreachStyle: "Direct, short, and concrete.",
  accountSignals: { type: "hiring", role: "RevOps Systems Lead" },
});

assert(system.includes("Jane Doe"), "system includes sender full name");
assert(system.includes("PRIVACY CONSTRAINT"), "privacy guard is appended");
assert(prompt.includes("Northstar Revenue"), "prompt includes company");
assert(prompt.includes("Maya Chen"), "prompt includes persona name");
assert(prompt.includes("VP Revenue Operations"), "prompt includes persona title");
assert(prompt.includes(narrativeArc), "prompt embeds narrative arc markdown");
assert(
  prompt.includes(JSON.stringify(rubricBuyer, null, 2)),
  "prompt embeds buyer rubric JSON",
);
assert(!system.includes("Omar"), "system has no Omar leakage");
assert(!system.includes("Inkeep"), "system has no Inkeep leakage");
assert(!prompt.includes("Omar"), "prompt has no Omar leakage");
assert(!prompt.includes("Inkeep"), "prompt has no Inkeep leakage");

const opp = {
  recipient_email: "maya@northstar.example",
  recipient_name: "Maya Chen",
  recipient_title: "VP Revenue Operations",
};

assert.equal(
  pickPrimaryBuyerPersona(
    [
      { name: "Wrong", title: "CEO", email: "wrong@example.com" },
      { name: "Email Match", title: "CRO", email: "maya@northstar.example" },
    ],
    opp,
  )?.name,
  "Email Match",
  "email match wins",
);

assert.equal(
  pickPrimaryBuyerPersona([{ name: "Maya Chen", title: "VP RevOps" }], opp)
    ?.title,
  "VP RevOps",
  "name match wins after email",
);

assert.equal(
  pickPrimaryBuyerPersona([{ name: "First", title: "COO" }], {
    ...opp,
    recipient_name: "No Match",
  })?.name,
  "First",
  "first persona is fallback",
);

assert.equal(
  pickPrimaryBuyerPersona([], opp)?.name,
  "Maya Chen",
  "recipient columns synthesize fallback",
);

console.log("PASS: icp account outreach prompt");
