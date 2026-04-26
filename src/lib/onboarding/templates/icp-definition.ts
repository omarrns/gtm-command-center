import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolSet } from "ai";
import {
  ICP_EXTRACTION_SYSTEM_PROMPT,
  ICP_ORCHESTRATOR_SYSTEM_PROMPT,
  buildIcpInterviewerSystemPrompt,
} from "@/lib/onboarding/icp-prompts";
import { z } from "zod";
import {
  buyerSchema,
  firmographicsSchema,
  icpEditsSchema,
  icpExtractionSchema,
  icpRubricSchema,
  productSchema,
  proofPointsSchema,
  signalsSchema,
  technographicsSchema,
  type IcpEdits,
  type IcpExtraction,
} from "@/lib/onboarding/icp-schemas";
import type {
  ArtifactKindContract,
  CompletionStatus,
  Dimension,
  InterviewTemplate,
  OutputMapping,
} from "./types";

export type { IcpEdits, IcpExtraction } from "@/lib/onboarding/icp-schemas";
export { icpExtractionSchema } from "@/lib/onboarding/icp-schemas";

const ARTIFACT_KIND_CONTRACT: ArtifactKindContract = {
  kindOptions: [
    "positive_example",
    "negative_example",
    "buyer_persona",
    "company_context",
  ],
  defaultTextKind: "company_context",
  defaultFileKind: "company_context",
  fileKindMatchers: [],
  // Any URL that isn't a personal LinkedIn profile is treated as a
  // good-fit customer artifact (the "Bad-fit" pill opts in via a kind
  // override at submit time).
  defaultUrlKind: "positive_example",
  urlKindMatchers: [
    { urlSubstring: "linkedin.com/in/", kind: "buyer_persona" },
  ],
};

// ── Dimensions ─────────────────────────────────────────────────────────────

const dimensions: readonly Dimension[] = [
  {
    key: "product",
    label: "Product",
    description:
      "What the agent/product does, the core JTBD it replaces, and its wedge into the market. Grounded in company_context artifacts — can't be inferred from exemplars.",
    confidenceThreshold: 0.75,
  },
  {
    key: "buyer",
    label: "Buyer roles",
    description:
      "Economic buyer, champion, and end-user role titles. Derived from buyer_persona artifacts + declared context.",
    confidenceThreshold: 0.75,
  },
  {
    key: "firmographics",
    label: "Firmographics",
    description:
      "Industries, employee range, company stage, geographies. Pattern-extracted across positive exemplars; disagreements with declared ICP surface to the interviewer.",
    confidenceThreshold: 0.75,
  },
  {
    key: "technographics",
    label: "Technographics",
    description:
      "Required and excluded tools. Required tools come from positive exemplars' stacks; excluded from negative exemplars + declarative disqualifiers.",
    confidenceThreshold: 0.7,
  },
  {
    key: "signals",
    label: "Signals",
    description:
      "Hiring roles, JTBD evidence, and trigger events that reveal live pain at an account. Must be queryable — an unqueryable signal is noise.",
    confidenceThreshold: 0.7,
  },
  {
    key: "disqualifiers",
    label: "Disqualifiers",
    description:
      "Hard no's that exclude an account even if other criteria fit. Derived from negative_example artifacts + declarative statements.",
    confidenceThreshold: 0.75,
  },
  {
    key: "proof_points",
    label: "Proof points",
    description:
      "Existing customers, won deals, lost-deal reasons. Grounded — only names the user explicitly provided; never invented.",
    confidenceThreshold: 0.75,
  },
];

// ── Output transforms ──────────────────────────────────────────────────────

function joinSections(parts: (string | false)[]): string {
  return parts.filter(Boolean).join("\n\n---\n\n");
}

function bulletList(items: string[]): string {
  if (items.length === 0) return "(none)";
  return items.map((i) => `- ${i}`).join("\n");
}

function renderCompanyIcp(edits: IcpEdits): string {
  return joinSections([
    `## Product\n\n- **Category**: ${edits.product.category || "(not set)"}\n- **Core JTBD**: ${edits.product.core_jtbd || "(not set)"}\n- **Wedge**: ${edits.product.wedge || "(not set)"}`,
    `## Buyer\n\n- **Economic buyer**: ${edits.icp.buyer.economic_buyer || "(not set)"}\n- **Champion**: ${edits.icp.buyer.champion || "(not set)"}\n- **End user**: ${edits.icp.buyer.end_user || "(not set)"}`,
    `## Firmographics\n\n- **Industries**: ${edits.icp.firmographics.industries.join(", ") || "(none)"}\n- **Employee range**: ${edits.icp.firmographics.employee_range_min}–${edits.icp.firmographics.employee_range_max}\n- **Stages**: ${edits.icp.firmographics.stages.join(", ") || "(none)"}\n- **Geographies**: ${edits.icp.firmographics.geographies.join(", ") || "(none)"}`,
    `## Technographics\n\n### Required\n\n${bulletList(edits.icp.technographics.required_tools)}\n\n### Excluded\n\n${bulletList(edits.icp.technographics.excluded_tools)}`,
    `## Signals\n\n### Hiring roles\n\n${bulletList(edits.icp.signals.hiring_roles)}\n\n### JTBD evidence\n\n${bulletList(edits.icp.signals.jtbd_evidence)}\n\n### Trigger events\n\n${bulletList(edits.icp.signals.trigger_events)}`,
  ]);
}

function renderProofPoints(edits: IcpEdits): string {
  return joinSections([
    `## Existing customers\n\n${bulletList(edits.proof_points.existing_customers)}`,
    `## Won deals\n\n${bulletList(edits.proof_points.won_deals)}`,
    `## Lost deal reasons\n\n${bulletList(edits.proof_points.lost_deals_reasons)}`,
  ]);
}

function renderDisqualifiers(edits: IcpEdits): string {
  return `## Disqualifiers\n\n${bulletList(edits.icp.disqualifiers)}`;
}

// ── Per-dimension renderer + meaningfulness predicate ──────────────────────
//
// The agentic interviewer uses these to surface what the orchestrator
// already inferred so it can ask a confirm/correct question instead of
// the dimension's textbook open-ender. Lives in this file (not in
// icp-prompts.ts) because icp-prompts is the dependency, not the
// dependent — flipping that direction would create a cycle.

const DEFAULT_EMPLOYEE_MIN = 0;
const DEFAULT_EMPLOYEE_MAX = 10000;
const disqualifiersValueSchema = z.array(z.string()).default([]);

// Map dimension key → schema. Used by both the renderer and the
// meaningfulness predicate so they agree on shape.
const DIMENSION_SCHEMAS: Record<string, z.ZodType<unknown>> = {
  product: productSchema,
  buyer: buyerSchema,
  firmographics: firmographicsSchema,
  technographics: technographicsSchema,
  signals: signalsSchema,
  disqualifiers: disqualifiersValueSchema,
  proof_points: proofPointsSchema,
};

function safeParse<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function anyNonEmptyString(values: readonly unknown[]): boolean {
  return values.some((v) => isNonEmptyString(v));
}

// Arrays-of-strings count as meaningful only when they contain at least
// one non-blank entry. Guards against `[""]` or `["  "]` from the
// orchestrator (or a stale extraction) flipping the meaningfulness bit.
function hasNonEmptyEntry(values: readonly string[]): boolean {
  return values.some(isNonEmptyString);
}

/**
 * Returns true only if the orchestrator's structured guess for this
 * dimension carries any meaningful signal. Guards against two false
 * positives: an all-empty product object (`{ category: "", core_jtbd:
 * "", wedge: "" }`) and a fully defaulted firmographics object where
 * `employee_range_max=10000 > 0` would otherwise look like a real
 * number. See `unitTestHasMeaningfulHypothesisValue` in
 * scripts/test-icp-interview.ts for the full case grid.
 */
export function hasMeaningfulHypothesisValue(
  dimensionKey: string,
  value: unknown,
): boolean {
  const schema = DIMENSION_SCHEMAS[dimensionKey];
  if (!schema) return false;
  const parsed = safeParse(schema, value);
  if (parsed === null || parsed === undefined) return false;

  switch (dimensionKey) {
    case "product": {
      const v = parsed as z.infer<typeof productSchema>;
      return anyNonEmptyString([v.category, v.core_jtbd, v.wedge]);
    }
    case "buyer": {
      const v = parsed as z.infer<typeof buyerSchema>;
      return anyNonEmptyString([v.economic_buyer, v.champion, v.end_user]);
    }
    case "firmographics": {
      const v = parsed as z.infer<typeof firmographicsSchema>;
      const rangeIsCustom =
        v.employee_range_min !== DEFAULT_EMPLOYEE_MIN ||
        v.employee_range_max !== DEFAULT_EMPLOYEE_MAX;
      return (
        hasNonEmptyEntry(v.industries) ||
        hasNonEmptyEntry(v.stages) ||
        hasNonEmptyEntry(v.geographies) ||
        rangeIsCustom
      );
    }
    case "technographics": {
      const v = parsed as z.infer<typeof technographicsSchema>;
      return (
        hasNonEmptyEntry(v.required_tools) || hasNonEmptyEntry(v.excluded_tools)
      );
    }
    case "signals": {
      const v = parsed as z.infer<typeof signalsSchema>;
      return (
        hasNonEmptyEntry(v.hiring_roles) ||
        hasNonEmptyEntry(v.jtbd_evidence) ||
        hasNonEmptyEntry(v.trigger_events)
      );
    }
    case "disqualifiers": {
      const v = parsed as readonly string[];
      return hasNonEmptyEntry([...v]);
    }
    case "proof_points": {
      const v = parsed as z.infer<typeof proofPointsSchema>;
      return (
        hasNonEmptyEntry(v.existing_customers) ||
        hasNonEmptyEntry(v.won_deals) ||
        hasNonEmptyEntry(v.lost_deals_reasons)
      );
    }
    default:
      return false;
  }
}

function renderDimensionValue(
  dimensionKey: string,
  value: unknown,
): string | null {
  const schema = DIMENSION_SCHEMAS[dimensionKey];
  if (!schema) return null;
  const parsed = safeParse(schema, value);
  if (parsed === null || parsed === undefined) return null;

  switch (dimensionKey) {
    case "product": {
      const v = parsed as z.infer<typeof productSchema>;
      return [
        `- **Category**: ${v.category || "(not set)"}`,
        `- **Core JTBD**: ${v.core_jtbd || "(not set)"}`,
        `- **Wedge**: ${v.wedge || "(not set)"}`,
      ].join("\n");
    }
    case "buyer": {
      const v = parsed as z.infer<typeof buyerSchema>;
      return [
        `- **Economic buyer**: ${v.economic_buyer || "(not set)"}`,
        `- **Champion**: ${v.champion || "(not set)"}`,
        `- **End user**: ${v.end_user || "(not set)"}`,
      ].join("\n");
    }
    case "firmographics": {
      const v = parsed as z.infer<typeof firmographicsSchema>;
      return [
        `- **Industries**: ${v.industries.join(", ") || "(none)"}`,
        `- **Employee range**: ${v.employee_range_min}–${v.employee_range_max}`,
        `- **Stages**: ${v.stages.join(", ") || "(none)"}`,
        `- **Geographies**: ${v.geographies.join(", ") || "(none)"}`,
      ].join("\n");
    }
    case "technographics": {
      const v = parsed as z.infer<typeof technographicsSchema>;
      return [
        `### Required\n${bulletList(v.required_tools)}`,
        `### Excluded\n${bulletList(v.excluded_tools)}`,
      ].join("\n\n");
    }
    case "signals": {
      const v = parsed as z.infer<typeof signalsSchema>;
      return [
        `### Hiring roles\n${bulletList(v.hiring_roles)}`,
        `### JTBD evidence\n${bulletList(v.jtbd_evidence)}`,
        `### Trigger events\n${bulletList(v.trigger_events)}`,
      ].join("\n\n");
    }
    case "disqualifiers": {
      const v = parsed as readonly string[];
      return bulletList([...v]);
    }
    case "proof_points": {
      const v = parsed as z.infer<typeof proofPointsSchema>;
      return [
        `### Existing customers\n${bulletList(v.existing_customers)}`,
        `### Won deals\n${bulletList(v.won_deals)}`,
        `### Lost deal reasons\n${bulletList(v.lost_deals_reasons)}`,
      ].join("\n\n");
    }
    default:
      return null;
  }
}

const outputs: readonly OutputMapping<IcpEdits, IcpExtraction>[] = [
  {
    type: "memory_doc",
    key: "company_icp",
    title: "Company ICP",
    transform: ({ edits }) => renderCompanyIcp(edits),
  },
  {
    type: "memory_doc",
    key: "icp_proof_points",
    title: "ICP Proof Points",
    transform: ({ edits }) => renderProofPoints(edits),
  },
  {
    type: "memory_doc",
    key: "icp_disqualifiers",
    title: "ICP Disqualifiers",
    transform: ({ edits }) => renderDisqualifiers(edits),
  },
  {
    type: "pipeline_config",
    // Minimal config. Automated GTM discovery via Exa is deferred
    // (docs/DEFERRED.md); search_queries stays empty and will be populated
    // by the Exa discovery adapter when that SPEC lands. Defaults for
    // score_threshold + daily_send_cap keep the schema happy.
    transform: () => ({
      score_threshold: 70,
      search_queries: [],
      search_locations: [],
      daily_send_cap: 10,
    }),
  },
  {
    type: "scoring_profile_normalize",
  },
];

// ── Completion check + normalizer ──────────────────────────────────────────

async function completionCheck(
  svc: SupabaseClient,
  userId: string,
): Promise<CompletionStatus> {
  const [icpDocRes, profileRes, configRes] = await Promise.all([
    svc
      .from("memory_documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("document_key", "company_icp"),
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", userId)
      .maybeSingle(),
    svc
      .from("pipeline_config")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const completedSteps: number[] = [];
  if ((icpDocRes.count ?? 0) > 0) completedSteps.push(1);
  if (profileRes.data?.icp_rubric) completedSteps.push(2);
  if ((configRes.count ?? 0) > 0) completedSteps.push(3);

  return {
    complete: completedSteps.length === 3,
    completedSteps,
  };
}

async function normalizeScoringProfile(
  svc: SupabaseClient,
  userId: string,
  context?: { interviewId?: string },
): Promise<void> {
  // Source of truth for icp_rubric is the in-flight confirm's unified
  // `extracted` JSONB. The normalizer runs from inside performConfirm
  // BEFORE the status flip to 'confirmed', so we cannot filter by
  // status. context.interviewId is passed by the dispatcher (audit
  // finding 2). When called outside confirm (e.g., a manual
  // re-normalize), fall back to the most-recent confirmed row for this
  // template + user.
  let row: { extracted: unknown } | null = null;
  if (context?.interviewId) {
    const { data } = await svc
      .from("onboarding_interviews")
      .select("extracted")
      .eq("id", context.interviewId)
      .eq("user_id", userId)
      .eq("template_id", "icp_definition")
      .maybeSingle();
    row = data;
  } else {
    const { data } = await svc
      .from("onboarding_interviews")
      .select("extracted")
      .eq("user_id", userId)
      .eq("template_id", "icp_definition")
      .eq("status", "confirmed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    row = data;
  }

  if (!row?.extracted) return;
  const interview = row;

  const extracted = interview.extracted as IcpExtraction;

  const icpRubric = {
    product: extracted.product,
    buyer: extracted.icp.buyer,
    firmographics: extracted.icp.firmographics,
    technographics: extracted.icp.technographics,
    signals: extracted.icp.signals,
    disqualifiers: extracted.icp.disqualifiers,
    proof_points: extracted.proof_points,
  };

  const { error } = await svc.from("user_scoring_profiles").upsert(
    {
      user_id: userId,
      icp_rubric: icpRubric,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error(
      `[icp normalizer] write failed for user ${userId}:`,
      error.message,
    );
  }
}

// ── Template ───────────────────────────────────────────────────────────────

const ICP_TOPICS = [
  "product",
  "buyer",
  "firmographics",
  "technographics",
  "signals",
  "disqualifiers",
  "proof_points",
] as const;

export const ICP_DEFINITION_TEMPLATE: InterviewTemplate<
  IcpEdits,
  IcpExtraction
> = {
  id: "icp_definition",
  version: "v1",

  agenticMode: true,
  dimensions,
  rubricSchema: icpRubricSchema,
  orchestratorModel: "claude-opus-4-6",
  orchestratorMaxOutputTokens: 8192,
  orchestratorSystemPrompt: () => ICP_ORCHESTRATOR_SYSTEM_PROMPT,
  // positiveExemplarCount comes from the call sites (chat/route +
  // startAgenticInterviewAction) which load it from onboarding_artifacts
  // via countPositiveExemplars. job_search's prompt builder ignores it.
  interviewerSystemPrompt: (ctx) => {
    const renderedHypothesisBlock =
      ctx.hypothesisValue !== undefined &&
      hasMeaningfulHypothesisValue(ctx.nextDimension.key, ctx.hypothesisValue)
        ? (renderDimensionValue(ctx.nextDimension.key, ctx.hypothesisValue) ??
          undefined)
        : undefined;
    return buildIcpInterviewerSystemPrompt({
      isRefresh: ctx.isRefresh,
      existingProfile: ctx.existingProfile,
      nextDimension: ctx.nextDimension,
      currentHypothesis: ctx.currentHypothesis,
      positiveExemplarCount: ctx.positiveExemplarCount ?? 0,
      renderedHypothesisBlock,
      hypothesisConfidence: ctx.hypothesisConfidence,
    });
  },

  // Agentic flow bypasses the static systemPrompt/tools/opening — these are
  // set for interface completeness. The real conversational seed is the
  // first-dimension question produced via startAgenticInterviewAction.
  systemPrompt: () => ICP_ORCHESTRATOR_SYSTEM_PROMPT,
  tools: {} as ToolSet,
  openingMessage:
    "Let's define your ICP. Drop in customers you'd want more of — LinkedIn URLs, company sites, or just names. Add your product deck or website if you have it. A couple of bad-fit examples help too.",
  refreshOpeningMessage:
    "Let's refresh your ICP. What's changed since last time — new customer patterns, new disqualifiers, new signals?",
  maxAssistantMessages: 14,
  wrapUpThreshold: 12,
  completionMarker: "[INTERVIEW_COMPLETE]",
  completionTopicThreshold: 5,
  chatModel: "claude-sonnet-4-6",
  chatMaxOutputTokens: 1024,

  topics: ICP_TOPICS,
  topicLabels: {
    product: "Product",
    buyer: "Buyer",
    firmographics: "Firmographics",
    technographics: "Technographics",
    signals: "Signals",
    disqualifiers: "Disqualifiers",
    proof_points: "Proof points",
  },

  extractionSchema: icpExtractionSchema,
  extractionSystemPrompt: ICP_EXTRACTION_SYSTEM_PROMPT,
  extractionModel: "claude-opus-4-6",
  extractionMaxOutputTokens: 4096,

  editsSchema: icpEditsSchema,
  outputs,
  completionCheck,
  normalizeScoringProfile,
  userTypeOnConfirm: "gtm",
  artifactKindContract: ARTIFACT_KIND_CONTRACT,
};
