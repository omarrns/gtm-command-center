import { z } from "zod";
import {
  buildInterviewPrompt,
  interviewTools,
  INTERVIEW_TOPICS,
  OPENING_MESSAGE,
  REFRESH_OPENING_MESSAGE,
} from "@/lib/onboarding/interview-prompt";
import { EXTRACTION_SYSTEM_PROMPT } from "@/lib/onboarding/extraction-prompt";
import { INSIGHTS_SYSTEM_PROMPT } from "@/lib/onboarding/story-prompt";
import {
  insightsSchema,
  type ExtractionInsights,
} from "@/lib/onboarding/insights-schema";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ArtifactKindContract,
  CompletionStatus,
  Dimension,
  InterviewTemplate,
} from "../types";
import { outputs } from "./outputs";
import { normalizeScoringProfile } from "./scoring-profile";

// ── Schemas ───────────────────────────────────────────────────────────────

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
// Re-export for back-compat — review-section-insights.tsx imports this name
// from the job-search template module. New code should import from
// @/lib/onboarding/insights-schema.
export type { ExtractionInsights };

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

// ── Artifact contract ─────────────────────────────────────────────────────

const ARTIFACT_KIND_CONTRACT: ArtifactKindContract = {
  kindOptions: [
    "linkedin",
    "website",
    "pasted_text",
    "resume",
    "uploaded_file",
  ],
  defaultTextKind: "pasted_text",
  defaultFileKind: "uploaded_file",
  fileKindMatchers: [{ fileNameSubstring: "resume", kind: "resume" }],
  defaultUrlKind: "website",
  urlKindMatchers: [{ urlSubstring: "linkedin.com", kind: "linkedin" }],
};

// ── Completion check ──────────────────────────────────────────────────────

async function completionCheck(
  svc: SupabaseClient,
  userId: string,
): Promise<CompletionStatus> {
  const [profileRes, configRes, outreachRes] = await Promise.all([
    svc
      .from("memory_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("document_key", "user_profile"),
    svc
      .from("pipeline_config")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    svc
      .from("memory_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("document_key", "feedback_outreach_style"),
  ]);

  const completedSteps: number[] = [];
  if ((profileRes.count ?? 0) > 0) completedSteps.push(1);
  if ((configRes.count ?? 0) > 0) completedSteps.push(2);
  if ((outreachRes.count ?? 0) > 0) completedSteps.push(3);

  return {
    complete: completedSteps.length === 3,
    completedSteps,
  };
}

// ── Dimensions ────────────────────────────────────────────────────────────

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

// ── Two-agent prompts ─────────────────────────────────────────────────────

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

// ── Template ──────────────────────────────────────────────────────────────

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

  insightsSchema,
  insightsSystemPrompt: INSIGHTS_SYSTEM_PROMPT,

  editsSchema,
  outputs,
  completionCheck,
  normalizeScoringProfile,
  userTypeOnConfirm: "job_seeker",
  artifactKindContract: ARTIFACT_KIND_CONTRACT,
};
