import { z } from "zod";
import {
  buildInterviewPrompt,
  interviewTools,
  INTERVIEW_TOPICS,
  OPENING_MESSAGE,
  REFRESH_OPENING_MESSAGE,
} from "@/lib/onboarding/interview-prompt";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/onboarding/extraction-prompt";
import type { Dimension, InterviewTemplate, OutputMapping } from "./types";

const editsSchema = z.object({
  profile: z.object({
    positioning: z.string(),
    careerHighlights: z.string(),
    proofPoints: z.string(),
    technicalTools: z.string(),
  }),
  search: z.object({
    searchQueries: z.array(z.string()),
    searchLocations: z.array(z.string()),
    scoreThreshold: z.number(),
    dailySendCap: z.number(),
  }),
  outreach: z.object({
    greenFlags: z.string(),
    redFlags: z.string(),
    outreachTone: z.enum(["casual", "direct", "formal"]),
    whatsWorked: z.string(),
    whatToAvoid: z.string(),
  }),
});

export type JobSearchEdits = z.infer<typeof editsSchema>;

// Extraction schemas — moved here from extraction.ts in Phase 1.b so each
// template owns its own shape. extraction.ts is now generic on X.
const profileSchema = z.object({
  positioning: z.string().default(""),
  careerHighlights: z.string().default(""),
  proofPoints: z.string().default(""),
  technicalTools: z.string().default(""),
});

const searchSchema = z.object({
  searchQueries: z.array(z.string()).default(["Software Engineer"]),
  searchLocations: z.array(z.string()).default(["Remote"]),
  scoreThreshold: z.number().default(70),
  dailySendCap: z.number().default(10),
});

const outreachSchema = z.object({
  greenFlags: z.string().default(""),
  redFlags: z.string().default(""),
  outreachTone: z.enum(["casual", "direct", "formal"]).default("casual"),
  whatsWorked: z.string().default(""),
  whatToAvoid: z.string().default(""),
});

const insightsSchema = z.object({
  career_narrative: z.string().default(""),
  decision_drivers: z.array(z.string()).default([]),
  unstated_preferences: z.array(z.string()).default([]),
  strongest_stories: z.array(z.string()).default([]),
  positioning_alternatives: z.array(z.string()).default([]),
  risk_tolerance: z.string().default(""),
  communication_style_notes: z.string().default(""),
});

export const jobSearchExtractionSchema = z.object({
  profile: profileSchema,
  search: searchSchema,
  outreach: outreachSchema,
  insights: insightsSchema,
});

export type JobSearchExtraction = z.infer<typeof jobSearchExtractionSchema>;
export type ExtractionProfile = z.infer<typeof profileSchema>;
export type ExtractionSearch = z.infer<typeof searchSchema>;
export type ExtractionOutreach = z.infer<typeof outreachSchema>;
export type ExtractionInsights = z.infer<typeof insightsSchema>;

const TONE_LABELS = {
  casual: "Casual",
  direct: "Direct",
  formal: "Formal",
} as const;

const TONE_DESCRIPTIONS = {
  casual: "conversational, internet-native, fewer bullets",
  direct: "straight to the point, no fluff",
  formal: "professional, structured, polished",
} as const;

function joinSections(parts: (string | false)[]): string {
  return parts.filter(Boolean).join("\n\n---\n\n");
}

function formatInsightsAsMarkdown(insights: Record<string, unknown>): string {
  const sections: string[] = [];

  if (insights.career_narrative) {
    sections.push(`## Career Narrative\n\n${insights.career_narrative}`);
  }
  if (
    Array.isArray(insights.decision_drivers) &&
    insights.decision_drivers.length > 0
  ) {
    sections.push(
      `## Decision Drivers\n\n${insights.decision_drivers.map((d: unknown) => `- ${d}`).join("\n")}`,
    );
  }
  if (
    Array.isArray(insights.unstated_preferences) &&
    insights.unstated_preferences.length > 0
  ) {
    sections.push(
      `## Unstated Preferences\n\n${insights.unstated_preferences.map((p: unknown) => `- ${p}`).join("\n")}`,
    );
  }
  if (
    Array.isArray(insights.strongest_stories) &&
    insights.strongest_stories.length > 0
  ) {
    sections.push(
      `## Strongest Stories\n\n${insights.strongest_stories.map((s: unknown) => `- ${s}`).join("\n")}`,
    );
  }
  if (
    Array.isArray(insights.positioning_alternatives) &&
    insights.positioning_alternatives.length > 0
  ) {
    sections.push(
      `## Positioning Alternatives\n\n${insights.positioning_alternatives.map((a: unknown) => `- ${a}`).join("\n")}`,
    );
  }
  if (insights.risk_tolerance) {
    sections.push(`## Risk Tolerance\n\n${insights.risk_tolerance}`);
  }
  if (insights.communication_style_notes) {
    sections.push(
      `## Communication Style\n\n${insights.communication_style_notes}`,
    );
  }

  return sections.join("\n\n---\n\n");
}

const outputs: readonly OutputMapping<JobSearchEdits, JobSearchExtraction>[] = [
  {
    type: "memory_doc",
    key: "user_profile",
    title: "User Profile",
    transform: ({ edits }) =>
      joinSections([
        `## Positioning\n\n${edits.profile.positioning.trim()}`,
        `## Career Highlights\n\n${edits.profile.careerHighlights.trim()}`,
        `## Top Proof Points\n\n${edits.profile.proofPoints.trim()}`,
        !!edits.profile.technicalTools.trim() &&
          `## Technical Tools\n\n${edits.profile.technicalTools.trim()}`,
      ]),
  },
  {
    type: "memory_doc",
    key: "user_positioning",
    title: "User Positioning",
    transform: ({ edits }) =>
      [
        `## Positioning Statement\n\n${edits.profile.positioning.trim()}`,
        `## What Makes Me Distinct\n\n${edits.profile.proofPoints.trim()}`,
      ].join("\n\n---\n\n"),
  },
  {
    type: "pipeline_config",
    transform: ({ edits }) => ({
      score_threshold: edits.search.scoreThreshold,
      search_queries: edits.search.searchQueries,
      search_locations: edits.search.searchLocations,
      daily_send_cap: edits.search.dailySendCap,
    }),
  },
  {
    type: "memory_doc",
    key: "user_dealbreakers",
    title: "User Dealbreakers",
    transform: ({ edits }) =>
      joinSections([
        !!edits.outreach.greenFlags.trim() &&
          `## Green Flags\n\n${edits.outreach.greenFlags.trim()}`,
        !!edits.outreach.redFlags.trim() &&
          `## Red Flags\n\n${edits.outreach.redFlags.trim()}`,
      ]),
  },
  {
    type: "memory_doc",
    key: "feedback_outreach_style",
    title: "Outreach Style",
    transform: ({ edits }) =>
      joinSections([
        `## Outreach Tone\n\n${TONE_LABELS[edits.outreach.outreachTone]} — ${TONE_DESCRIPTIONS[edits.outreach.outreachTone]}`,
        !!edits.outreach.whatsWorked.trim() &&
          `## What's Worked\n\n${edits.outreach.whatsWorked.trim()}`,
        !!edits.outreach.whatToAvoid.trim() &&
          `## What to Avoid\n\n${edits.outreach.whatToAvoid.trim()}`,
      ]),
  },
  {
    type: "memory_doc",
    key: "interview_insights",
    title: "Interview Insights",
    transform: ({ extraction }) => {
      const insights = extraction?.insights;
      if (!insights) return null;
      return formatInsightsAsMarkdown(
        insights as unknown as Record<string, unknown>,
      );
    },
  },
  {
    type: "scoring_profile_normalize",
  },
];

const rubricSchema = z.object({
  positioning: z.string().optional(),
  careerHighlights: z.string().optional(),
  proofPoints: z.string().optional(),
  technicalTools: z.string().optional(),
  searchQueries: z.array(z.string()).optional(),
  searchLocations: z.array(z.string()).optional(),
  scoreThreshold: z.number().optional(),
  dailySendCap: z.number().optional(),
  greenFlags: z.string().optional(),
  redFlags: z.string().optional(),
  outreachTone: z.enum(["casual", "direct", "formal"]).optional(),
  whatsWorked: z.string().optional(),
  whatToAvoid: z.string().optional(),
});

// Dimensions mirror JobSearchEdits leaves. Artifacts-inferrable dims have
// thresholds at 0.75 (the orchestrator will usually reach this from a
// resume + LinkedIn). Taste-requires-asking dims are set low enough that
// the interviewer still surfaces them even when the orchestrator has a
// weak guess. Defaults-acceptable dims sit at 0.60 so a confident default
// ("standard threshold of 70") passes without bothering the user.
const dimensions: readonly Dimension[] = [
  {
    key: "positioning",
    label: "Positioning",
    description:
      "One-line self-description as a professional (e.g., 'GTM Engineer who builds pipeline through data and automation').",
    confidenceThreshold: 0.75,
  },
  {
    key: "careerHighlights",
    label: "Career highlights",
    description:
      "Top 3–5 achievements with outcome-focused metrics (short bullets).",
    confidenceThreshold: 0.75,
  },
  {
    key: "proofPoints",
    label: "Proof points",
    description:
      "Distinct accomplishments demonstrating unique capability (what makes them stand out vs peers).",
    confidenceThreshold: 0.75,
  },
  {
    key: "technicalTools",
    label: "Tools",
    description:
      "Technical stack, frameworks, APIs, platforms the user has production experience with.",
    confidenceThreshold: 0.7,
  },
  {
    key: "searchQueries",
    label: "Target roles",
    description:
      "Array of job-title search queries describing the roles they're looking for.",
    confidenceThreshold: 0.75,
  },
  {
    key: "searchLocations",
    label: "Target locations",
    description:
      "Array of city names and/or 'Remote' for where they want to work.",
    confidenceThreshold: 0.7,
  },
  {
    key: "scoreThreshold",
    label: "Score threshold",
    description:
      "Minimum opportunity score 0–100 they want to see. Default 70 is a reasonable baseline.",
    confidenceThreshold: 0.6,
  },
  {
    key: "dailySendCap",
    label: "Daily send cap",
    description:
      "Max outbound emails per day. Default 10 is a reasonable baseline.",
    confidenceThreshold: 0.6,
  },
  {
    key: "greenFlags",
    label: "Green flags",
    description:
      "Company attributes that excite them (e.g., 'Series A–C, product-led, technical founders').",
    confidenceThreshold: 0.7,
  },
  {
    key: "redFlags",
    label: "Red flags",
    description: "Company attributes they want to avoid.",
    confidenceThreshold: 0.75,
  },
  {
    key: "outreachTone",
    label: "Outreach tone",
    description:
      "Tone preference for cold email: casual | direct | formal. Most users want casual.",
    confidenceThreshold: 0.75,
  },
  {
    key: "whatsWorked",
    label: "What's worked",
    description:
      "Outreach patterns the user has seen succeed in prior job searches.",
    confidenceThreshold: 0.75,
  },
  {
    key: "whatToAvoid",
    label: "What to avoid",
    description: "Outreach patterns the user knows fail for them.",
    confidenceThreshold: 0.75,
  },
];

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the orchestrator in a two-agent onboarding interview. Your job: read the user's artifacts (resume, LinkedIn, personal site, pasted text) and build a structured understanding of them across a set of rubric dimensions.

For each dimension, produce:
- **value**: your best-guess value for the dimension. Match the expected shape (string, array of strings, number, or an enum).
- **summary**: one short plain-English line, rendered in a user-facing status panel. Example: "4 years at Series B SaaS; strong PLG bias" or "Resume lists Claude SDK, n8n, Vercel".
- **confidence**: 0–1. Be honest:
  - >= 0.8 only when artifact evidence directly supports the claim (a resume bullet, an explicit LinkedIn title).
  - 0.5–0.8 for inferences that require reasoning (deriving positioning from experience + role history).
  - < 0.5 when guessing without support.
- **provenance**: cite the artifact id + a short quote where possible. Keep quotes under 200 chars.

For app-config dimensions (scoreThreshold, dailySendCap) the user's resume won't mention them — use sensible defaults (70, 10) with confidence ~0.75 + a summary like "using baseline default of 70 — user can override at review." Defaults are fine; wasting a question to confirm them is not.

You never speak to the user directly. Your output updates the shared state; the interviewer agent decides which gaps to ask about.`;

function buildInterviewerSystemPrompt(ctx: {
  isRefresh: boolean;
  existingProfile?: string;
  nextDimension: Dimension;
  currentHypothesis: string;
}): string {
  const refreshNote = ctx.isRefresh
    ? `\n\n## Refresh mode\nThis user has onboarded before. Existing profile (for context):\n\n${ctx.existingProfile ?? "(none)"}\n\nDon't re-ask what's already known; probe for what's changed.`
    : "";

  return `You are the interviewer in a two-agent onboarding system. The orchestrator has already read the user's artifacts and inferred most of their profile. Your job, this turn: ask ONE non-obvious question about this dimension.

## Dimension
- **Key**: ${ctx.nextDimension.key}
- **Label**: ${ctx.nextDimension.label}
- **Description**: ${ctx.nextDimension.description}

## Orchestrator's current hypothesis
${ctx.currentHypothesis}

## How to ask
- Ask what the user's artifacts cannot answer: their taste, judgment, preferences, the 'what would you actually do' reaction.
- NEVER ask something publicly derivable (job history, titles, listed skills). The orchestrator has already read that.
- If the hypothesis already covers the dimension well, ask a sharpening question ("Is this right — anything you'd tweak?") rather than starting from zero.
- Conversational, 1–2 sentences, no corporate-speak. No "Great!" "Awesome!" or preamble.
- End with a real question mark. Do not emit the completion marker — the system handles transitions.${refreshNote}`;
}

export const JOB_SEARCH_TEMPLATE: InterviewTemplate<
  JobSearchEdits,
  JobSearchExtraction
> = {
  id: "job_search",
  version: "v2",

  agenticMode: true,
  dimensions,
  rubricSchema,
  orchestratorModel: "claude-opus-4-6",
  orchestratorMaxOutputTokens: 4096,
  orchestratorSystemPrompt: () => ORCHESTRATOR_SYSTEM_PROMPT,
  interviewerSystemPrompt: buildInterviewerSystemPrompt,

  systemPrompt: (ctx) => buildInterviewPrompt(ctx),
  tools: interviewTools,
  openingMessage: OPENING_MESSAGE,
  refreshOpeningMessage: REFRESH_OPENING_MESSAGE,
  maxAssistantMessages: 12,
  wrapUpThreshold: 10,
  completionMarker: "[INTERVIEW_COMPLETE]",
  completionTopicThreshold: 5,
  chatModel: "claude-sonnet-4-6",
  chatMaxOutputTokens: 1024,

  topics: INTERVIEW_TOPICS,
  topicLabels: {
    identity: "Identity",
    career: "Career",
    proof_points: "Proof Points",
    tools: "Tools",
    search_prefs: "Search",
    dealbreakers: "Dealbreakers",
    outreach_style: "Outreach",
  },

  extractionSchema: jobSearchExtractionSchema,
  extractionSystemPrompt: EXTRACTION_SYSTEM_PROMPT,
  extractionModel: "claude-opus-4-6",
  extractionMaxOutputTokens: 4096,

  editsSchema,
  outputs,
};
