import type { ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

export type InterviewTemplateId = "job_search" | "icp_definition";

// Template-owned artifact-kind contract. Classifies a user-supplied URL,
// pasted text, or uploaded file into the artifact kind this template
// expects to store. Pure data (no functions) so it survives the
// client-projection boundary in `toClientTemplate`.
//
// Matchers run in declaration order; first match wins. `substring` is
// case-insensitive against the URL or file name.
export interface UrlKindMatcher {
  readonly urlSubstring: string;
  readonly kind: string;
}

export interface FileKindMatcher {
  readonly fileNameSubstring: string;
  readonly kind: string;
}

export interface ArtifactKindContract {
  /**
   * All artifact kinds this template can produce. Informational — used
   * by UI guards and future template-tests, not by the matcher logic.
   */
  readonly kindOptions: readonly string[];

  /** Kind assigned to pasted text when no explicit override applies. */
  readonly defaultTextKind: string;

  /** Fallback kind for file uploads. fileKindMatchers checked first. */
  readonly defaultFileKind: string;
  readonly fileKindMatchers: readonly FileKindMatcher[];

  /** Fallback kind for URLs. urlKindMatchers checked first. */
  readonly defaultUrlKind: string;
  readonly urlKindMatchers: readonly UrlKindMatcher[];
}

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

  // Derive user_scoring_profiles fields from this template's confirmed
  // outputs. Optional — a template without scoring (e.g., a pure workflow
  // template) can omit. job_search reads memory_documents + pipeline_config
  // (no context needed); ICP reads the current interview's `extracted`
  // payload via context.interviewId because the normalizer runs BEFORE
  // status flips to 'confirmed', so a "latest confirmed" lookup wouldn't
  // see the in-flight row.
  normalizeScoringProfile?: (
    svc: SupabaseClient,
    userId: string,
    context?: { interviewId?: string },
  ) => Promise<void>;

  // The persona this template confirms the user into. Written to
  // profiles.user_type exactly once — at the first successful confirm —
  // per SPEC-3's write-timing rule. job_search → 'job_seeker',
  // icp_definition → 'gtm'.
  userTypeOnConfirm: "job_seeker" | "gtm";

  // How ArtifactInput classifies a URL / file / paste into an artifact
  // kind for this template. Moves kind-routing logic off of templateId
  // conditionals in the UI so adding a third template is a data change.
  artifactKindContract: ArtifactKindContract;
}

export interface InterviewerContext extends InterviewPromptContext {
  nextDimension: Dimension;
  currentHypothesis: string;
  // Optional, ICP-only: count of succeeded `positive_example` artifacts
  // for this interview. Drives the exemplar-scarcity branching in the
  // ICP interviewer prompt. job_search ignores this field.
  positiveExemplarCount?: number;
  // The orchestrator's structured guess for nextDimension (e.g. for
  // product: { category, core_jtbd, wedge }). Templates that want to
  // surface this in the prompt render it themselves in their
  // interviewerSystemPrompt wrapper to avoid an import cycle from
  // shared prompt code into per-template renderers.
  hypothesisValue?: unknown;
  hypothesisConfidence?: number;
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
      // Story-screen synthesis. Streamed via /api/onboard/story/stream so
      // the user watches the insight sections appear instead of staring at
      // a hidden 30-second wait inside confirm. Optional on the agentic
      // branch — templates without an insights leaf (e.g. ICP) skip the
      // story phase and route review → confirmed directly.
      insightsSchema?: z.ZodType<unknown, z.ZodTypeDef, unknown>;
      insightsSystemPrompt?: string;
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
  artifactKindContract: ArtifactKindContract;
}
