/**
 * Test extraction quality from a transcript fixture.
 *
 * Loads the transcript fixture, runs runExtractionFromTranscript(),
 * prints the structured output, and asserts required fields.
 *
 * Usage: npx tsx scripts/test-extraction.ts
 */

import type { UIMessage } from "ai";

// Inline transcript fixture (same as onboard-fixture.ts)
const transcriptFixture: UIMessage[] = [
  {
    id: "1",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Hey! I'm here to get a quick read on who you are professionally so we can find the right opportunities for you. Let's start with the big picture \u2014 what do you do, and what makes you different from others with a similar title?",
      },
    ],
  },
  {
    id: "2",
    role: "user",
    parts: [
      {
        type: "text",
        text: "I'm a GTM Engineer \u2014 basically the person who connects data, APIs, and automation to revenue. I'm not a traditional marketer or a pure engineer. I build systems that drive pipeline. What makes me different is I've been on both sides \u2014 I was an investor who needed intelligence, and now I'm the person who builds those intelligence systems.",
      },
    ],
  },
  {
    id: "3",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "That investor-to-builder arc is interesting. Walk me through the last 2-3 roles \u2014 the real version, not the resume. What did you actually build and what happened?",
      },
    ],
  },
  {
    id: "4",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Most recently at Inkeep, I built Compass \u2014 a closed-loop GTM intelligence platform. It ingested every Gong sales call via Claude AI, extracted structured intelligence like objections and competitor mentions, then programmatically generated content. Results: 400K+ impressions, 50+ qualified enterprise leads, 1:400 LinkedIn visitor-to-lead ratio. Before that I built Mira Migo, an AI career coaching app \u2014 grew to 3K users, $6K MRR peak, all organic. And at 500 Global I automated processing of 500+ investor updates per month using GPT-4 API.",
      },
    ],
  },
  {
    id: "5",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Those are strong numbers. The Compass system especially \u2014 that's a full loop from conversation data to revenue attribution. What tools and stack do you typically work with?",
      },
    ],
  },
  {
    id: "6",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Claude SDK, Claude API, Node.js and TypeScript for everything, Vercel for deployment, PostHog for analytics, n8n for workflow automation, Exa and Firecrawl APIs for data, and I use Claude Code and Cursor as my dev tools. I'm a vibe coder \u2014 can't write code from scratch but can build and ship full-stack production apps with AI tools.",
      },
    ],
  },
  {
    id: "7",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Got it. Now let's talk about what you're looking for next \u2014 what does the ideal role look like, and what makes you instantly close a tab on a job posting?",
      },
    ],
  },
  {
    id: "8",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Looking for GTM Engineer or Growth Engineer roles, ideally Series A-C companies with product-led growth and small GTM teams. San Francisco or remote. Green flags: technical founders, sitting on fragmented data they can't make sense of. Red flags: enterprise-only sales motion, no product yet, agency or consultancy model. I want a company that tried to solve their intelligence problem and couldn't.",
      },
    ],
  },
  {
    id: "9",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: "Last thing \u2014 when you reach out cold to someone at a company you're interested in, what's your style? What's worked and what hasn't?",
      },
    ],
  },
  {
    id: "10",
    role: "user",
    parts: [
      {
        type: "text",
        text: "Casual, internet-native tone. Fewer bullets, more conversational. Peer frame not applicant frame \u2014 I'm reaching out as someone who builds things, not someone asking for a job. Simple binary asks work best. What doesn't work: long intros, flattery, bullet-heavy emails, 'I noticed you...' openers, or mirror-backing their LinkedIn at them.",
      },
    ],
  },
];

async function main() {
  console.log("Loading extraction module...");
  const { runExtractionFromTranscript } =
    await import("../src/lib/onboarding/extraction");
  const { JOB_SEARCH_TEMPLATE } =
    await import("../src/lib/onboarding/templates/job-search");

  console.log("Running extraction on transcript fixture...\n");
  const result = await runExtractionFromTranscript(
    transcriptFixture,
    JOB_SEARCH_TEMPLATE,
  );

  console.log(JSON.stringify(result, null, 2));
  console.log("\n--- Assertions ---\n");

  let failures = 0;

  function assert(condition: boolean, label: string) {
    if (condition) {
      console.log(`  PASS: ${label}`);
    } else {
      console.error(`  FAIL: ${label}`);
      failures++;
    }
  }

  // (a) all required profile fields are non-empty
  assert(!!result.profile.positioning, "profile.positioning is non-empty");
  assert(
    !!result.profile.careerHighlights,
    "profile.careerHighlights is non-empty",
  );
  assert(!!result.profile.proofPoints, "profile.proofPoints is non-empty");

  // (b) searchQueries is a non-empty array
  assert(
    Array.isArray(result.search.searchQueries) &&
      result.search.searchQueries.length > 0,
    "search.searchQueries is a non-empty array",
  );

  // (c) insights object has all expected keys
  const insightKeys = [
    "career_narrative",
    "decision_drivers",
    "unstated_preferences",
    "strongest_stories",
    "positioning_alternatives",
    "risk_tolerance",
    "communication_style_notes",
  ];
  for (const key of insightKeys) {
    assert(key in result.insights, `insights.${key} exists`);
  }

  // (d) outreachTone is one of the valid enum values
  assert(
    ["casual", "direct", "formal"].includes(result.outreach.outreachTone),
    `outreach.outreachTone is valid enum (got "${result.outreach.outreachTone}")`,
  );

  console.log(
    `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
  );
  if (failures > 0) process.exit(1);
}

main();
