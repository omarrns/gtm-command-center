import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELS } from "@/lib/ai/anthropic";
import { runGenerateObject } from "@/lib/ai/calls";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { loadMemoryContext } from "@/lib/skills/context";
import { extractSenderIdentity } from "@/lib/skills/sender-identity";
import {
  buildIcpProspectFitPrompt,
  buildIcpProspectFitSystem,
} from "@/lib/skills/prompts/icp-prospect-fit";
import type { PipelineConfigRow } from "@/lib/supabase/types";
import {
  prospectIcpAnalysisSchema,
  type ProspectIcpAnalysis,
} from "./schemas";
import type { ProspectRow } from "./types";

const MAX_PROSPECTS_PER_JOB = 20;

export async function scoreProspectAgainstIcp({
  svc,
  userId,
  prospect,
  rubric,
  runId,
}: {
  svc: SupabaseClient;
  userId: string;
  prospect: ProspectRow;
  rubric: IcpRubric;
  runId?: string;
}): Promise<ProspectIcpAnalysis> {
  const memoryCtx = await loadMemoryContext(userId, svc);
  const sender = extractSenderIdentity(memoryCtx, memoryCtx.displayName);

  return runGenerateObject({
    model: MODELS.sonnet,
    system: buildIcpProspectFitSystem(sender),
    prompt: buildIcpProspectFitPrompt({
      rubric,
      prospect: {
        displayName: prospect.display_name,
        commentText: prospect.comment_text,
        likeCount: prospect.comment_like_count,
        evidence: prospect.evidence,
      },
    }),
    schema: prospectIcpAnalysisSchema,
    maxOutputTokens: 4096,
    scope: {
      userId,
      runId,
      scopeTable: "prospects",
      scopeId: prospect.id,
      callPurpose: "score-youtube-prospect",
    },
  });
}

export async function scoreYoutubeProspectsForReview({
  svc,
  userId,
  reviewId,
  rubric,
  config,
  runId,
}: {
  svc: SupabaseClient;
  userId: string;
  reviewId: string;
  rubric: IcpRubric;
  config: PipelineConfigRow;
  runId?: string;
}): Promise<Record<string, unknown>> {
  const prospects = await loadDiscoveredProspects(svc, userId, reviewId);
  let scored = 0;
  let filtered = 0;
  let errors = 0;

  for (const prospect of prospects) {
    try {
      const analysis = await scoreProspectAgainstIcp({
        svc,
        userId,
        prospect,
        rubric,
        runId,
      });
      const normalized = normalizeProspectAnalysis(analysis);
      const { data: analysisRow, error: analysisError } = await svc
        .from("analyses")
        .insert({
          user_id: userId,
          skill_slug: "icp-prospect-fit",
          company_name: normalized.company.name,
          role_title: null,
          job_description: prospect.comment_text,
          status: "complete",
          input: {
            prospect_id: prospect.id,
            source: prospect.source,
            video_icp_review_id: prospect.video_icp_review_id,
          },
          result: normalized,
        })
        .select("id")
        .single();
      if (analysisError) throw analysisError;

      const status = normalized.score >= config.score_threshold
        ? "scored"
        : "filtered";
      const { error: updateError } = await svc
        .from("prospects")
        .update({
          status,
          score: Math.round(normalized.score),
          score_components: buildProspectScoreComponents(normalized),
          analysis_id: analysisRow.id,
          company_name: normalized.company.name,
          company_domain: normalizeDomain(normalized.company.domain),
          company_confidence: normalized.company.confidence,
          last_error: null,
        })
        .eq("id", prospect.id)
        .eq("user_id", userId);
      if (updateError) throw updateError;

      if (status === "scored") scored++;
      else filtered++;
    } catch (err) {
      errors++;
      await svc
        .from("prospects")
        .update({
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", prospect.id)
        .eq("user_id", userId);
    }
  }

  return { processed: prospects.length, scored, filtered, errors };
}

function buildProspectScoreComponents(
  analysis: ProspectIcpAnalysis,
): Record<string, unknown> {
  return {
    verdict: analysis.verdict,
    reason: analysis.reason,
    fit_signals: analysis.fitSignals,
    objections_or_needs: analysis.objectionsOrNeeds,
    company: analysis.company,
  };
}

function normalizeProspectAnalysis(
  analysis: ProspectIcpAnalysis,
): ProspectIcpAnalysis {
  return {
    ...analysis,
    score: Math.max(0, Math.min(100, Math.round(analysis.score))),
    company: {
      ...analysis.company,
      domain: normalizeDomain(analysis.company.domain),
    },
  };
}

function normalizeDomain(domain: string | null): string | null {
  if (!domain) return null;
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0] ?? null;
}

async function loadDiscoveredProspects(
  svc: SupabaseClient,
  userId: string,
  reviewId: string,
): Promise<ProspectRow[]> {
  const { data, error } = await svc
    .from("prospects")
    .select("*")
    .eq("user_id", userId)
    .eq("video_icp_review_id", reviewId)
    .eq("status", "discovered")
    .order("created_at", { ascending: true })
    .limit(MAX_PROSPECTS_PER_JOB);

  if (error) throw new Error(`Failed to load prospects to score: ${error.message}`);
  return (data ?? []) as ProspectRow[];
}
