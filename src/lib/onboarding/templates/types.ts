import type { ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

export type InterviewTemplateId = "job_search";

export interface CompletionStatus {
  complete: boolean;
  completedSteps: number[];
}

export interface InterviewPromptContext {
  isRefresh: boolean;
  existingProfile?: string;
}

export interface ConfirmContext<E, X> {
  edits: E;
  extraction: X | null;
}

export type OutputMemoryDoc<E, X> = {
  type: "memory_doc";
  key: string;
  title: string;
  transform: (ctx: ConfirmContext<E, X>) => string | null;
};

export type OutputPipelineConfig<E, X> = {
  type: "pipeline_config";
  transform: (ctx: ConfirmContext<E, X>) => Record<string, unknown> | null;
};

export type OutputScoringProfileNormalize = {
  type: "scoring_profile_normalize";
};

export type OutputMapping<E, X> =
  | OutputMemoryDoc<E, X>
  | OutputPipelineConfig<E, X>
  | OutputScoringProfileNormalize;

// Per-dimension rubric config used by the agentic orchestrator + interviewer.
// `key` identifies the dimension across OrchestratorState.dimensions and the
// template's rubricSchema top-level keys.
export interface Dimension {
  key: string;
  label: string;
  description: string;
  confidenceThreshold: number;
}

interface BaseInterviewTemplate<E, X> {
  id: InterviewTemplateId;
  version: string;

  // Chat phase
  systemPrompt: (ctx: InterviewPromptContext) => string;
  tools: ToolSet;
  openingMessage: string;
  refreshOpeningMessage: string;
  maxAssistantMessages: number;
  wrapUpThreshold: number;
  completionMarker: string;
  completionTopicThreshold: number;
  chatModel: string;
  chatMaxOutputTokens: number;

  // Topic tracking (legacy)
  topics: readonly string[];
  topicLabels: Record<string, string>;

  // Extraction phase — input side is `unknown` so schemas that use
  // `.default()` (which makes inputs optional) still assign cleanly.
  extractionSchema: z.ZodType<X, z.ZodTypeDef, unknown>;
  extractionSystemPrompt: string;
  extractionModel: string;
  extractionMaxOutputTokens: number;

  // Confirm phase
  editsSchema: z.ZodType<E, z.ZodTypeDef, unknown>;
  outputs: readonly OutputMapping<E, X>[];

  // Onboarding completion gate — template-owned so each persona can define
  // its own "confirmed enough to leave /onboard" criteria. job_search
  // checks three specific memory docs + pipeline_config; ICP will check
  // its own ICP-shaped memory docs + icp_rubric.
  completionCheck: (
    svc: SupabaseClient,
    userId: string,
  ) => Promise<CompletionStatus>;
}

export interface InterviewerContext extends InterviewPromptContext {
  nextDimension: Dimension;
  currentHypothesis: string;
}

// A template either runs the legacy extract-then-review flow or the agentic
// orchestrator+interviewer flow. Discriminated by `agenticMode` so callers
// that need orchestrator-specific fields narrow cleanly.
export type InterviewTemplate<E = unknown, X = unknown> =
  | (BaseInterviewTemplate<E, X> & { agenticMode: false })
  | (BaseInterviewTemplate<E, X> & {
      agenticMode: true;
      dimensions: readonly Dimension[];
      rubricSchema: z.ZodType<unknown, z.ZodTypeDef, unknown>;
      orchestratorModel: string;
      orchestratorMaxOutputTokens: number;
      orchestratorSystemPrompt: (ctx: InterviewPromptContext) => string;
      interviewerSystemPrompt: (ctx: InterviewerContext) => string;
    });

// Client-safe projection. Client components cannot receive zod schemas,
// functions, or tool definitions across the RSC boundary — only the plain
// data they actually render.
export interface ClientInterviewTemplate {
  id: InterviewTemplateId;
  topics: readonly string[];
  topicLabels: Record<string, string>;
  openingMessage: string;
  refreshOpeningMessage: string;
  agenticMode: boolean;
  dimensions: ReadonlyArray<{ key: string; label: string }>;
}
