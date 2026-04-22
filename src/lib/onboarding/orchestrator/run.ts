import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import type {
  Dimension,
  InterviewTemplate,
} from "@/lib/onboarding/templates/types";
import type { OnboardingArtifactRow } from "@/lib/supabase/types";
import type {
  OrchestratorDimension,
  OrchestratorProvenance,
  OrchestratorState,
} from "./types";
import { emptyOrchestratorState } from "./types";

type AgenticTemplate = Extract<InterviewTemplate, { agenticMode: true }>;

// Analysis-level shape the orchestrator Opus call writes. Each dimension it
// reads from artifacts gets a value guess, a one-line rationale, a confidence
// score, and provenance pointing back to the artifact(s) it drew from.
const dimensionAnalysisSchema = z.object({
  value: z.unknown(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  provenance: z
    .array(
      z.object({
        artifactId: z.string().optional(),
        sourceLabel: z.string(),
        quote: z.string().optional(),
      }),
    )
    .default([]),
});

const analysisResultSchema = z.object({
  dimensions: z.record(z.string(), dimensionAnalysisSchema),
});

const singleDimensionResultSchema = z.object({
  value: z.unknown(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
});

async function loadArtifactsForInterview(
  svc: SupabaseClient,
  interviewId: string,
): Promise<OnboardingArtifactRow[]> {
  const { data, error } = await svc
    .from("onboarding_artifacts")
    .select("*")
    .eq("interview_id", interviewId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load artifacts: ${error.message}`);
  return (data ?? []) as OnboardingArtifactRow[];
}

function buildArtifactsBlock(artifacts: OnboardingArtifactRow[]): string {
  if (artifacts.length === 0) return "(no artifacts provided)";
  return artifacts
    .map((a, i) => {
      const label =
        a.source_label ??
        a.source_url ??
        a.file_name ??
        `${a.kind} artifact #${i + 1}`;
      return `<artifact id="${a.id}" kind="${a.kind}" source="${label}">\n${a.normalized_markdown ?? ""}\n</artifact>`;
    })
    .join("\n\n");
}

function buildDimensionsBlock(dimensions: readonly Dimension[]): string {
  return dimensions
    .map(
      (d) =>
        `- **${d.key}** (threshold ${d.confidenceThreshold.toFixed(2)}): ${d.description}`,
    )
    .join("\n");
}

// Max times the interviewer can ask the same dimension. Bounded so an
// ambiguous answer can still get a follow-up, but the interview can't loop
// forever on one stubbornly-low-confidence dimension. When the cap is hit,
// the dimension graduates even if still below threshold and the user
// corrects it at review.
const MAX_ASKS_PER_DIMENSION = 2;

function computeNextKey(
  state: OrchestratorState,
  template: AgenticTemplate,
): string | null {
  for (const dim of template.dimensions) {
    const askCount = state.askedDimensionKeys.filter(
      (k) => k === dim.key,
    ).length;
    if (askCount >= MAX_ASKS_PER_DIMENSION) continue;
    const cur = state.dimensions[dim.key];
    if (!cur || cur.confidence < dim.confidenceThreshold) {
      return dim.key;
    }
  }
  return null;
}

function dimensionStatusFromConfidence(
  confidence: number,
  threshold: number,
  answered: boolean,
): OrchestratorDimension["status"] {
  if (answered) return "answered";
  if (confidence >= threshold) return "inferred";
  return "needs_question";
}

/**
 * Read all succeeded artifacts for this interview, call Opus to produce a
 * per-dimension confidence map, merge into orchestrator_state.
 * Runs after each new artifact lands.
 */
export async function analyzeArtifacts(
  interviewId: string,
  svc: SupabaseClient,
  template: AgenticTemplate,
  ctx: { isRefresh: boolean; existingProfile?: string },
): Promise<OrchestratorState> {
  const allArtifacts = await loadArtifactsForInterview(svc, interviewId);
  const succeeded = allArtifacts.filter((a) => a.status === "succeeded");
  const failed = allArtifacts.filter((a) => a.status === "failed");

  // Load current state so we can preserve answered dimensions and the
  // asked-keys history across re-analyses.
  const { data: interviewRow, error: interviewErr } = await svc
    .from("onboarding_interviews")
    .select("orchestrator_state")
    .eq("id", interviewId)
    .single();
  if (interviewErr || !interviewRow) {
    throw new Error(
      `Failed to load interview: ${interviewErr?.message ?? "not found"}`,
    );
  }

  const prior =
    (interviewRow.orchestrator_state as OrchestratorState | null) ??
    emptyOrchestratorState(template.id);

  const next: OrchestratorState = {
    ...prior,
    templateId: template.id,
    status: "analyzing",
    // Manifest includes ALL artifacts (succeeded + failed) so the status
    // panel can surface failures after the user enters the chat phase.
    artifacts: allArtifacts.map((a) => ({
      id: a.id,
      kind: a.kind,
      sourceType: a.source_type,
      sourceLabel: a.source_label ?? undefined,
      sourceUrl: a.source_url ?? undefined,
      status: a.status,
      errorMessage: a.error_message ?? undefined,
    })),
    metrics: {
      ...prior.metrics,
      artifactSuccessCount: succeeded.length,
      artifactFailureCount: failed.length,
    },
  };

  if (succeeded.length === 0) {
    // No succeeded artifacts to analyze. Interviewer will ask every
    // dimension. Failures are still in the manifest for UI visibility.
    next.status = "interviewing";
    next.nextDimensionKey = computeNextKey(next, template);
    await persistState(svc, interviewId, next);
    return next;
  }

  const prompt = [
    `<artifacts>\n${buildArtifactsBlock(succeeded)}\n</artifacts>`,
    `<dimensions>\n${buildDimensionsBlock(template.dimensions)}\n</dimensions>`,
    ctx.existingProfile
      ? `<existing_profile>\n${ctx.existingProfile}\n</existing_profile>`
      : "",
    `For each dimension, infer a value from the artifacts. Produce:`,
    `- **value**: your best-guess value for the dimension`,
    `- **summary**: one-line plain-English rationale for a user-facing status panel`,
    `- **confidence**: 0–1 score. High (>0.8) only when artifact evidence directly supports it. Low (<0.5) when guessing.`,
    `- **provenance**: cite the artifact id + a short quote when possible.`,
    `Return an entry for EVERY dimension, even low-confidence guesses.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const { object } = await generateObject({
    model: anthropic(template.orchestratorModel),
    system: template.orchestratorSystemPrompt({
      isRefresh: ctx.isRefresh,
      existingProfile: ctx.existingProfile,
    }),
    prompt,
    schema: analysisResultSchema,
    maxOutputTokens: template.orchestratorMaxOutputTokens,
  });

  const now = new Date().toISOString();

  for (const dim of template.dimensions) {
    const analyzed = object.dimensions[dim.key];
    const existing = prior.dimensions[dim.key];

    // Never downgrade a dimension the user has explicitly answered.
    if (existing?.status === "answered" || existing?.status === "confirmed") {
      next.dimensions[dim.key] = existing;
      continue;
    }

    if (!analyzed) {
      next.dimensions[dim.key] = existing ?? {
        value: null,
        summary: "Not yet inferred from artifacts.",
        confidence: 0,
        threshold: dim.confidenceThreshold,
        status: "unknown",
        provenance: [],
        updatedAt: now,
      };
      continue;
    }

    const provenance: OrchestratorProvenance[] = analyzed.provenance.map(
      (p) => ({
        artifactId: p.artifactId,
        sourceLabel: p.sourceLabel,
        quote: p.quote,
      }),
    );

    next.dimensions[dim.key] = {
      value: analyzed.value,
      summary: analyzed.summary,
      confidence: analyzed.confidence,
      threshold: dim.confidenceThreshold,
      status: dimensionStatusFromConfidence(
        analyzed.confidence,
        dim.confidenceThreshold,
        false,
      ),
      provenance,
      updatedAt: now,
    };
  }

  // ICP exemplar-scarcity clamp (audit finding 5). Deterministic
  // post-process so the product rule doesn't depend on the model
  // obeying the prompt. With 1-2 positive exemplars, dimensions
  // pattern-extracted from positives are capped at 0.6 — one or two
  // examples are evidence, not a pattern. Status flips back from
  // 'inferred' to 'needs_question' if the cap pushes confidence below
  // threshold.
  if (template.id === "icp_definition") {
    applyIcpExemplarScarcityClamp(next, succeeded, template.dimensions);
  }

  next.status = "interviewing";
  next.nextDimensionKey = computeNextKey(next, template);

  await persistState(svc, interviewId, next);
  return next;
}

// Dimensions that are pattern-extracted across positive_example artifacts.
// Capping confidence on these when positive count is 1-2 prevents the
// orchestrator from shipping a "rubric" that's really just one buyer.
const ICP_EXEMPLAR_DERIVED_DIMENSIONS = [
  "firmographics",
  "technographics",
  "signals",
  "proof_points",
] as const;

const ICP_EXEMPLAR_SCARCITY_CAP = 0.6;

export function countPositiveExemplars(
  artifacts: ReadonlyArray<OnboardingArtifactRow>,
): number {
  return artifacts.filter(
    (a) => a.kind === "positive_example" && a.status === "succeeded",
  ).length;
}

/**
 * Async DB version — count positive_example artifacts directly via a
 * COUNT query. Used by the chat route and kickoff action to drive the
 * ICP interviewer's exemplar-scarcity branching without loading full
 * artifact rows.
 */
export async function loadPositiveExemplarCount(
  svc: SupabaseClient,
  interviewId: string,
): Promise<number> {
  const { count } = await svc
    .from("onboarding_artifacts")
    .select("id", { count: "exact", head: true })
    .eq("interview_id", interviewId)
    .eq("kind", "positive_example")
    .eq("status", "succeeded");
  return count ?? 0;
}

function applyIcpExemplarScarcityClamp(
  state: OrchestratorState,
  succeededArtifacts: ReadonlyArray<OnboardingArtifactRow>,
  dimensions: ReadonlyArray<Dimension>,
): void {
  const count = countPositiveExemplars(succeededArtifacts);
  // The clamp only fires for 1-2 positive exemplars. Zero positives is
  // handled by the orchestrator prompt (declarative-only mode); 3+
  // positives is enough to pattern-match without artificial dampening.
  if (count === 0 || count >= 3) return;

  for (const key of ICP_EXEMPLAR_DERIVED_DIMENSIONS) {
    const dim = state.dimensions[key];
    if (!dim) continue;
    if (dim.confidence <= ICP_EXEMPLAR_SCARCITY_CAP) continue;
    const dimDef = dimensions.find((d) => d.key === key);
    if (!dimDef) continue;

    state.dimensions[key] = {
      ...dim,
      confidence: ICP_EXEMPLAR_SCARCITY_CAP,
      summary: `${dim.summary} (capped at ${ICP_EXEMPLAR_SCARCITY_CAP} — only ${count} positive exemplar${count === 1 ? "" : "s"}, not enough to call a pattern)`,
      status: dimensionStatusFromConfidence(
        ICP_EXEMPLAR_SCARCITY_CAP,
        dimDef.confidenceThreshold,
        false,
      ),
    };
  }
}

/**
 * Called after each interviewer turn with the user's answer. Narrow Opus
 * call targeted at one dimension. Updates that dimension's value, summary,
 * and confidence; records the user message as provenance.
 */
export async function updateDimensionFromAnswer(
  interviewId: string,
  dimensionKey: string,
  userAnswer: string,
  messageId: string,
  svc: SupabaseClient,
  template: AgenticTemplate,
): Promise<OrchestratorState> {
  const { data: interviewRow, error: interviewErr } = await svc
    .from("onboarding_interviews")
    .select("orchestrator_state")
    .eq("id", interviewId)
    .single();
  if (interviewErr || !interviewRow) {
    throw new Error(
      `Failed to load interview: ${interviewErr?.message ?? "not found"}`,
    );
  }

  const prior =
    (interviewRow.orchestrator_state as OrchestratorState | null) ??
    emptyOrchestratorState(template.id);

  const dim = template.dimensions.find((d) => d.key === dimensionKey);
  if (!dim) {
    throw new Error(`Unknown dimension key: ${dimensionKey}`);
  }

  const priorSummary =
    prior.dimensions[dimensionKey]?.summary ?? "No prior inference.";
  const priorValue = JSON.stringify(
    prior.dimensions[dimensionKey]?.value ?? null,
  );

  const prompt = [
    `<dimension key="${dim.key}">${dim.description}</dimension>`,
    `<prior_inference>${priorSummary}\nValue: ${priorValue}</prior_inference>`,
    `<user_answer>\n${userAnswer}\n</user_answer>`,
    `Update the dimension based on the user's answer. The user is the source of truth; confidence should be high (>=0.9) unless their answer is ambiguous.`,
  ].join("\n\n");

  const { object } = await generateObject({
    model: anthropic(template.orchestratorModel),
    system: template.orchestratorSystemPrompt({ isRefresh: false }),
    prompt,
    schema: singleDimensionResultSchema,
    maxOutputTokens: 512,
  });

  const now = new Date().toISOString();
  const existing = prior.dimensions[dimensionKey];
  const provenance: OrchestratorProvenance[] = [
    ...(existing?.provenance ?? []),
    {
      messageId,
      sourceLabel: "user answer",
      note: userAnswer.slice(0, 240),
    },
  ];

  const nextDimensions = {
    ...prior.dimensions,
    [dimensionKey]: {
      value: object.value,
      summary: object.summary,
      confidence: object.confidence,
      threshold: dim.confidenceThreshold,
      status: "answered" as const,
      provenance,
      updatedAt: now,
    },
  };

  const next: OrchestratorState = {
    ...prior,
    dimensions: nextDimensions,
    activeDimensionKey: null,
  };
  next.nextDimensionKey = computeNextKey(next, template);

  if (!next.nextDimensionKey) {
    next.status = "ready_for_review";
  }

  await persistState(svc, interviewId, next);
  return next;
}

/**
 * Pure function. Returns the dimension the interviewer should ask next, or
 * null if every dimension is above its threshold (or already asked).
 */
export function nextDimensionToAsk(
  state: OrchestratorState,
  template: AgenticTemplate,
): Dimension | null {
  const key = computeNextKey(state, template);
  if (!key) return null;
  return template.dimensions.find((d) => d.key === key) ?? null;
}

async function persistState(
  svc: SupabaseClient,
  interviewId: string,
  state: OrchestratorState,
): Promise<void> {
  const { error } = await svc
    .from("onboarding_interviews")
    .update({
      orchestrator_state: state,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId);
  if (error) {
    throw new Error(`Failed to persist orchestrator_state: ${error.message}`);
  }
}
