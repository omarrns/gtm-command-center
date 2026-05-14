"use server";

import { z } from "zod";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { MODELS, runClaudeJson } from "@/lib/ai/anthropic";
import { safeParseIcpRubric } from "@/lib/onboarding/icp-schemas";
import { formatMemoryForPrompt, loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  buildIcpAccountOutreachPrompt,
  buildIcpAccountOutreachSystem,
  icpAccountDraftOutputSchema,
  type IcpAccountDraftOutput,
} from "@/lib/skills/prompts/icp-account-outreach";
import { GTM_DRAFT_PRIVACY_GUARD } from "@/lib/pipeline/steps/draft-gtm";

const draftInputSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required."),
  buyerDescription: z.string().trim().min(1, "Buyer description is required."),
  extraContext: z.string().trim().optional(),
});

type DraftActionResult =
  | { ok: true; data: IcpAccountDraftOutput }
  | { ok: false; error: string };

export async function draftIcpAccountOutreachAction(
  input: unknown,
): Promise<DraftActionResult> {
  const parsedInput = draftInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return { ok: false, error: parsedInput.error.errors[0]?.message ?? "Invalid input." };
  }

  try {
    const user = await requireUser();
    const svc = createSupabaseServiceClient();
    const memoryCtx = await loadMemoryContext(user.id, svc);
    const narrativeArcMarkdown = formatMemoryForPrompt(memoryCtx, [
      "icp_narrative_arc",
    ]);
    if (!narrativeArcMarkdown.trim()) {
      return {
        ok: false,
        error: "Generate your ICP narrative arc by completing onboarding before drafting.",
      };
    }

    const [{ data: scoringProfile }, { data: arcDoc }] = await Promise.all([
      svc
        .from("user_scoring_profiles")
        .select("icp_rubric")
        .eq("user_id", user.id)
        .maybeSingle(),
      svc
        .from("memory_documents")
        .select("id")
        .eq("user_id", user.id)
        .eq("document_key", "icp_narrative_arc")
        .maybeSingle(),
    ]);

    const rubric = safeParseIcpRubric(scoringProfile?.icp_rubric ?? {});
    if (!rubric.success) {
      return { ok: false, error: "Your ICP rubric is missing or invalid." };
    }

    const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);
    const system =
      buildIcpAccountOutreachSystem(sender) + GTM_DRAFT_PRIVACY_GUARD;
    const prompt = buildIcpAccountOutreachPrompt({
      companyName: parsedInput.data.companyName,
      companyDomain: null,
      persona: {
        name: "(target buyer)",
        title: "",
        description: parsedInput.data.buyerDescription,
      },
      narrativeArcMarkdown,
      rubricBuyer: rubric.data.buyer,
      senderProfile: formatMemoryForPrompt(memoryCtx, [
        "user_profile",
        "user_omar_profile",
        "user_positioning",
      ]),
      outreachStyle: formatMemoryForPrompt(memoryCtx, [
        "feedback_outreach_style",
        "feedback_outreach_performance",
      ]),
      accountSignals: null,
      extraContext: parsedInput.data.extraContext,
    });

    const rawOutput = await runClaudeJson<unknown>({
      system,
      prompt,
      model: MODELS.sonnet,
      maxTokens: 4096,
      scope: {
        userId: user.id,
        scopeTable: "memory_documents",
        scopeId: (arcDoc?.id as string | undefined) ?? undefined,
        callPurpose: "scratch-draft",
      },
    });

    const draft = icpAccountDraftOutputSchema.safeParse(rawOutput);
    if (!draft.success) {
      return { ok: false, error: "Draft output was malformed. Try again." };
    }

    return { ok: true, data: draft.data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
