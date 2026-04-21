import type { ToolSet } from "ai";
import type { z } from "zod";

export type InterviewTemplateId = "job_search";

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

export interface InterviewTemplate<E = unknown, X = unknown> {
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

  // Topic tracking
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
}

// Client-safe projection. Client components cannot receive zod schemas,
// functions, or tool definitions across the RSC boundary — only the plain
// data they actually render.
export interface ClientInterviewTemplate {
  id: InterviewTemplateId;
  topics: readonly string[];
  topicLabels: Record<string, string>;
  openingMessage: string;
  refreshOpeningMessage: string;
}
