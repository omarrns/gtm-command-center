"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { MODELS, runClaudeJson } from "@/lib/ai/anthropic";
import { safeParseIcpRubric } from "@/lib/onboarding/icp-schemas";
import { ICP_NARRATIVE_SYSTEM_PROMPT } from "@/lib/onboarding/icp-narrative-prompt";
import { icpNarrativeArcSchema } from "@/lib/onboarding/icp-narrative-schema";
import { formatIcpNarrativeAsMarkdown } from "@/lib/onboarding/templates/icp-definition/narrative-formatter";

type GenerateIcpNarrativeResult =
  | { ok: true }
  | { ok: false; error: string };

interface NarrativeContext {
  scoringProfileId: string;
  reviewedContext: unknown;
}

type PreflightResult =
  | { ok: true; shouldGenerate: boolean }
  | { ok: false; error: string };

const CONTEXT_DOC_KEYS = [
  "company_icp",
  "icp_proof_points",
  "icp_disqualifiers",
] as const;

export async function generateIcpNarrativeArcAction(): Promise<GenerateIcpNarrativeResult> {
  try {
    const user = await requireUser();
    const svc = createSupabaseServiceClient();
    const preflight = await checkGenerationPreflight(svc, user.id);
    if (!preflight.ok) return preflight;
    if (!preflight.shouldGenerate) return { ok: true };

    const context = await loadNarrativeContext(svc, user.id);
    if (!context.ok) return context;

    const content = await generateNarrativeMarkdown(user.id, context.data);
    const saved = await saveNarrativeArc(svc, user.id, content);
    if (!saved.ok) return saved;

    revalidatePath("/icp");
    revalidatePath("/messaging");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkGenerationPreflight(
  svc: SupabaseClient,
  userId: string,
): Promise<PreflightResult> {
  const [{ data: profile }, { data: existingArc }] = await Promise.all([
    svc
      .from("profiles")
      .select("user_type")
      .eq("user_id", userId)
      .maybeSingle(),
    svc
      .from("memory_documents")
      .select("id")
      .eq("user_id", userId)
      .eq("document_key", "icp_narrative_arc")
      .maybeSingle(),
  ]);

  if (profile?.user_type !== "gtm") {
    return {
      ok: false,
      error: "ICP narrative generation is only for GTM users.",
    };
  }
  if (existingArc) return { ok: true, shouldGenerate: false };
  return { ok: true, shouldGenerate: true };
}

async function loadNarrativeContext(
  svc: SupabaseClient,
  userId: string,
): Promise<
  | { ok: true; data: NarrativeContext }
  | { ok: false; error: string }
> {
  const [{ data: scoringProfile }, { data: memoryDocs }] = await Promise.all([
    svc
      .from("user_scoring_profiles")
      .select("id, icp_rubric")
      .eq("user_id", userId)
      .maybeSingle(),
    svc
      .from("memory_documents")
      .select("document_key, content")
      .eq("user_id", userId)
      .in("document_key", [...CONTEXT_DOC_KEYS]),
  ]);

  if (!scoringProfile?.icp_rubric) {
    return {
      ok: false,
      error: "Finish ICP review before generating the buyer narrative story.",
    };
  }

  const rubric = safeParseIcpRubric(scoringProfile.icp_rubric);
  if (!rubric.success) {
    return { ok: false, error: "Your ICP rubric is missing or invalid." };
  }

  return {
    ok: true,
    data: {
      scoringProfileId: scoringProfile.id as string,
      reviewedContext: {
        icp_rubric: rubric.data,
        memory_documents: Object.fromEntries(
          (memoryDocs ?? []).map((doc) => [
            doc.document_key,
            doc.content ?? "",
          ]),
        ),
      },
    },
  };
}

async function generateNarrativeMarkdown(
  userId: string,
  context: NarrativeContext,
): Promise<string> {
  const rawArc = await runClaudeJson<unknown>({
    system: ICP_NARRATIVE_SYSTEM_PROMPT,
    prompt: buildBackfillPrompt(context.reviewedContext),
    model: MODELS.deepseekNarrative,
    maxTokens: 4096,
    scope: {
      userId,
      scopeTable: "user_scoring_profiles",
      scopeId: context.scoringProfileId,
      callPurpose: "icp-narrative-backfill",
    },
  });

  const parsedArc = icpNarrativeArcSchema.safeParse(rawArc);
  if (!parsedArc.success) {
    throw new Error("Narrative output was malformed. Try again.");
  }

  const content = formatIcpNarrativeAsMarkdown(parsedArc.data);
  if (!content) {
    throw new Error("Narrative output was empty. Try again.");
  }
  return content;
}

function buildBackfillPrompt(reviewedContext: unknown): string {
  return `<transcript>
No transcript is available for this backfill. Use reviewed_context as the canonical ICP source.
</transcript>

<reviewed_context>
${JSON.stringify(reviewedContext, null, 2)}
</reviewed_context>

Write the ICP buyer narrative arc now. Return JSON matching the schema in your system prompt.`;
}

async function saveNarrativeArc(
  svc: SupabaseClient,
  userId: string,
  content: string,
): Promise<GenerateIcpNarrativeResult> {
  const { error } = await svc.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: "icp_narrative_arc",
      title: "ICP Narrative Arc",
      origin: "onboarding",
      content,
      metadata: { generated_from: "rubric_backfill" },
    },
    { onConflict: "user_id,document_key" },
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
