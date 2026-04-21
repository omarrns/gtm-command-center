import { z } from "zod";
import {
  buildInterviewPrompt,
  interviewTools,
  INTERVIEW_TOPICS,
  OPENING_MESSAGE,
  REFRESH_OPENING_MESSAGE,
} from "@/lib/onboarding/interview-prompt";
import { extractionResultSchema } from "@/lib/onboarding/extraction";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/onboarding/extraction-prompt";
import type { InterviewTemplate, OutputMapping } from "./types";

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
export type JobSearchExtraction = z.infer<typeof extractionResultSchema>;

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

export const JOB_SEARCH_TEMPLATE: InterviewTemplate<
  JobSearchEdits,
  JobSearchExtraction
> = {
  id: "job_search",
  version: "v1",

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

  extractionSchema: extractionResultSchema,
  extractionSystemPrompt: EXTRACTION_SYSTEM_PROMPT,
  extractionModel: "claude-opus-4-6",
  extractionMaxOutputTokens: 4096,

  editsSchema,
  outputs,
};
