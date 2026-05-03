import type { SupabaseClient } from "@supabase/supabase-js";
import { safeParseIcpRubric } from "@/lib/onboarding/icp-schemas";

export interface IcpAgentContext {
  rubric: Record<string, unknown> | null;
  narrativeArc: string | null;
  proofPoints: unknown;
}

export async function loadIcpAgentContext(
  svc: SupabaseClient,
  userId: string,
): Promise<IcpAgentContext> {
  const [scoringRes, narrativeRes] = await Promise.all([
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", userId)
      .maybeSingle(),
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", userId)
      .eq("document_key", "icp_narrative_arc")
      .maybeSingle(),
  ]);

  const parsed = safeParseIcpRubric(scoringRes.data?.icp_rubric ?? null);
  const rubric = parsed.success
    ? (parsed.data as unknown as Record<string, unknown>)
    : null;

  return {
    rubric,
    narrativeArc: narrativeRes.data?.content?.trim() || null,
    proofPoints: rubric?.proof_points ?? null,
  };
}

export function renderIcpContextForPrompt(context: IcpAgentContext): string {
  return JSON.stringify(
    {
      icp_rubric: context.rubric,
      icp_narrative_arc: context.narrativeArc,
      proof_points: context.proofPoints,
    },
    null,
    2,
  );
}
