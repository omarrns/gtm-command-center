/**
 * Create onboarding fixture data for testing.
 *
 * Usage:
 *   npx tsx scripts/onboard-fixture.ts --state=partial   # Step 1 docs only (wizard resumes at Step 2)
 *   npx tsx scripts/onboard-fixture.ts --state=complete   # All docs + config (gate passes)
 *   npx tsx scripts/onboard-fixture.ts --state=empty      # Alias for onboard:reset
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resolveUserId(email: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .single();
  return data?.user_id ?? null;
}

// Parse --state=<value> from argv
function parseState(): "partial" | "complete" | "empty" {
  const arg = process.argv.find((a) => a.startsWith("--state="));
  const value = arg?.split("=")[1];
  if (value === "partial" || value === "complete" || value === "empty") {
    return value;
  }
  console.error("Usage: --state=partial | --state=complete | --state=empty");
  process.exit(1);
}

// Parse --interview-state=<value> from argv
type InterviewState = "transcript" | "review" | "ready";
function parseInterviewState(): InterviewState | null {
  const arg = process.argv.find((a) => a.startsWith("--interview-state="));
  if (!arg) return null;
  const value = arg.split("=")[1];
  if (value === "transcript" || value === "review" || value === "ready") {
    return value;
  }
  console.error(
    "Usage: --interview-state=transcript | --interview-state=review | --interview-state=ready",
  );
  process.exit(1);
}

// Realistic transcript fixture covering all 4 interview phases
function getTranscriptFixture() {
  return [
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
}

function getExtractedFixture() {
  return {
    profile: {
      positioning:
        "I'm a GTM Engineer who builds pipeline through data, APIs, and automation",
      careerHighlights:
        "- Built Compass at Inkeep: 400K+ impressions, 50+ enterprise leads, 1:400 visitor-to-lead ratio\\n- Grew Mira Migo to 3K users, $6K MRR peak, all organic\\n- 500 Global: automated 500+ investor updates/month with GPT-4 API",
      proofPoints:
        "- Closed-loop GTM platform: Gong calls \u2192 AI extraction \u2192 content \u2192 attribution\\n- Built and shipped Mira Migo from scratch using AI-assisted development\\n- 100x GEO growth through repeatable experimentation",
      technicalTools:
        "Claude SDK, Claude API, Node.js, TypeScript, Vercel, PostHog, n8n, Exa, Firecrawl",
    },
    search: {
      searchQueries: ["GTM Engineer", "Growth Engineer"],
      searchLocations: ["San Francisco", "Remote"],
      scoreThreshold: 70,
      dailySendCap: 10,
    },
    outreach: {
      greenFlags:
        "Series A-C, product-led growth, small GTM team, technical founders, sitting on fragmented data",
      redFlags:
        "Enterprise-only sales motion, no product yet, agency/consultancy",
      outreachTone: "casual" as const,
      whatsWorked:
        "Peer frame over applicant frame, simple binary asks, conversational tone",
      whatToAvoid:
        "Long intros, flattery, bullet-heavy emails, 'I noticed you...' openers, research mirror-backs",
    },
    insights: {
      career_narrative:
        "Omar's career is a single thesis expressed in increasingly powerful ways: unstructured data \u2192 structured intelligence \u2192 decision-ready output. He started as the person who needed that intelligence (investor at 500 Global) and became the person who builds it (Compass, Mira Migo).",
      decision_drivers: [
        "Wants to build, not execute someone else's playbook",
        "Needs a company with a real data/intelligence problem to solve",
        "Values speed and shipping over process",
        "Drawn to founders who think technically",
      ],
      unstated_preferences: [
        "Prefers small teams where he can own the entire GTM stack",
        "Values autonomy over title",
        "Wants his work to be visible and attributable",
      ],
      strongest_stories: [
        "Compass: full closed-loop from Gong calls to content to attribution",
        "Mira Migo: built from scratch to 3K users with zero paid spend",
        "500 Global intelligence platform: 500+ updates/month automated",
      ],
      positioning_alternatives: [
        "Growth Engineer who builds intelligence systems",
        "The person who connects fragmented data to revenue",
        "Full-stack GTM builder (not a marketer, not a pure engineer)",
      ],
      risk_tolerance:
        "Moderately selective \u2014 clear red flags, but open to different company sizes and stages within Series A-C",
      communication_style_notes:
        "Direct, casual, internet-native. Uses specific metrics naturally. Frames everything through builder lens, not job-seeker lens.",
    },
  };
}

async function resetUser(userId: string) {
  // Phase 10: delete interviews first (before memory docs)
  await supabase.from("onboarding_interviews").delete().eq("user_id", userId);

  await supabase
    .from("memory_documents")
    .delete()
    .eq("user_id", userId)
    .eq("origin", "onboarding");

  await supabase.from("pipeline_config").delete().eq("user_id", userId);

  // Phase 9: also clear derived scoring profile
  await supabase.from("user_scoring_profiles").delete().eq("user_id", userId);
}

async function main() {
  const state = parseState();
  const userId =
    process.env.SEED_USER_ID ?? (await resolveUserId("omarns059@gmail.com"));

  if (!userId) {
    console.error("Could not resolve user ID. Set SEED_USER_ID in env.");
    process.exit(1);
  }

  // Always reset first
  await resetUser(userId);

  if (state === "empty") {
    console.log("Reset to empty state (no onboarding data)");
    return;
  }

  // Step 1: user_profile + user_positioning
  const step1Docs = [
    {
      user_id: userId,
      document_key: "user_profile",
      title: "User Profile",
      origin: "onboarding",
      content:
        "## Positioning\n\nI'm a GTM Engineer who builds pipeline through data, APIs, and automation\n\n---\n\n## Career Highlights\n\n- Built Compass: 400K+ impressions, 50+ enterprise leads\n- Grew Mira Migo to 3K users, $6K MRR peak\n- 500 Global: automated 500+ investor updates/month\n\n---\n\n## Top Proof Points\n\n- Closed-loop GTM platform from Gong calls to attribution\n- Built and sold Compresso in 1 week\n- 100x GEO growth through experimentation\n\n---\n\n## Technical Tools\n\nClaude SDK, Node.js, TypeScript, PostHog, n8n, Vercel",
      metadata: {},
    },
    {
      user_id: userId,
      document_key: "user_positioning",
      title: "User Positioning",
      origin: "onboarding",
      content:
        "## Positioning Statement\n\nI'm a GTM Engineer who builds pipeline through data, APIs, and automation\n\n---\n\n## What Makes Me Distinct\n\n- Closed-loop GTM platform from Gong calls to attribution\n- Built and sold Compresso in 1 week\n- 100x GEO growth through experimentation",
      metadata: {},
    },
  ];

  const { error: step1Error } = await supabase
    .from("memory_documents")
    .upsert(step1Docs, { onConflict: "user_id,document_key" });

  if (step1Error) {
    console.error("Failed to insert Step 1 docs:", step1Error.message);
    process.exit(1);
  }

  console.log("Step 1 docs created (user_profile + user_positioning)");

  if (state === "partial") {
    console.log("Partial state: wizard will resume at Step 2");
    return;
  }

  // Step 2: pipeline_config
  const { error: configError } = await supabase.from("pipeline_config").upsert(
    {
      user_id: userId,
      score_threshold: 70,
      search_queries: ["GTM Engineer", "Growth Engineer"],
      search_locations: ["San Francisco", "New York"],
      daily_send_cap: 10,
    },
    { onConflict: "user_id" },
  );

  if (configError) {
    console.error("Failed to insert pipeline_config:", configError.message);
    process.exit(1);
  }

  console.log("Step 2 config created (pipeline_config)");

  // Step 3: user_dealbreakers + feedback_outreach_style
  const step3Docs = [
    {
      user_id: userId,
      document_key: "user_dealbreakers",
      title: "User Dealbreakers",
      origin: "onboarding",
      content:
        "## Green Flags\n\nSeries A-C, product-led growth, small GTM team, technical founders\n\n---\n\n## Red Flags\n\nEnterprise-only sales motion, no product yet, agency/consultancy",
      metadata: {},
    },
    {
      user_id: userId,
      document_key: "feedback_outreach_style",
      title: "Outreach Style",
      origin: "onboarding",
      content:
        "## Outreach Tone\n\nCasual — conversational, internet-native, fewer bullets\n\n---\n\n## What's Worked\n\nPeer frame over applicant frame, simple binary asks\n\n---\n\n## What to Avoid\n\nLong intros, flattery, bullet-heavy emails",
      metadata: {},
    },
  ];

  const { error: step3Error } = await supabase
    .from("memory_documents")
    .upsert(step3Docs, { onConflict: "user_id,document_key" });

  if (step3Error) {
    console.error("Failed to insert Step 3 docs:", step3Error.message);
    process.exit(1);
  }

  console.log(
    "Step 3 docs created (user_dealbreakers + feedback_outreach_style)",
  );

  // Phase 9: derive scoring profile from fixture data and verify
  const { normalizeScoringProfile } =
    await import("../src/lib/pipeline/scoring-profile");
  await normalizeScoringProfile(supabase, userId);

  const { data: sp } = await supabase
    .from("user_scoring_profiles")
    .select(
      "id, preferred_stages, tool_familiarity, target_roles, dealbreaker_patterns",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!sp) {
    console.error("FAIL: normalization produced no user_scoring_profiles row");
    process.exit(1);
  }

  // Fixture green flags include "Series A-C" — assert vocabulary expansion
  const expectedStages = ["series-a", "series-b", "series-c"];
  const missingStages = expectedStages.filter(
    (s) => !sp.preferred_stages.includes(s),
  );
  if (missingStages.length > 0) {
    console.error(
      `FAIL: preferred_stages missing expected values: ${JSON.stringify(missingStages)} (got ${JSON.stringify(sp.preferred_stages)})`,
    );
    process.exit(1);
  }

  // target_roles should match fixture search_queries
  if (sp.target_roles.length === 0) {
    console.error(
      "FAIL: target_roles is empty — pipeline_config not picked up",
    );
    process.exit(1);
  }

  console.log(
    `Scoring profile verified: stages=${JSON.stringify(sp.preferred_stages)}, tools=${JSON.stringify(sp.tool_familiarity)}, roles=${JSON.stringify(sp.target_roles)}`,
  );

  console.log("Complete state: onboarding gate will pass, Today loads");

  // Phase 10: optionally seed an interview state
  const interviewState = parseInterviewState();
  if (interviewState) {
    await seedInterview(userId, interviewState);
  }
}

async function seedInterview(userId: string, state: InterviewState) {
  const transcript = getTranscriptFixture();
  const extracted = getExtractedFixture();

  const row: Record<string, unknown> = {
    user_id: userId,
    is_refresh: false,
    topics_covered: [
      "identity",
      "career",
      "proof_points",
      "tools",
      "search_prefs",
      "dealbreakers",
      "outreach_style",
    ],
  };

  if (state === "transcript") {
    // in_progress with realistic transcript — for testing extraction
    row.status = "in_progress";
    row.messages = transcript;
    row.ready_for_extraction = false;
  } else if (state === "ready") {
    // in_progress with ready_for_extraction — for testing resume → auto-extract
    row.status = "in_progress";
    row.messages = transcript;
    row.ready_for_extraction = true;
  } else if (state === "review") {
    // review with pre-populated extracted columns — for testing review UI
    row.status = "review";
    row.messages = transcript;
    row.ready_for_extraction = true;
    row.extracted_profile = extracted.profile;
    row.extracted_search = extracted.search;
    row.extracted_outreach = extracted.outreach;
    row.extracted_insights = extracted.insights;
  }

  const { error } = await supabase.from("onboarding_interviews").insert(row);

  if (error) {
    console.error("Failed to seed interview:", error.message);
    process.exit(1);
  }

  console.log(`Interview seeded: state=${state}`);
}

main();
