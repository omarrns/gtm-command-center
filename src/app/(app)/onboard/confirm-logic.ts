import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScoringProfile } from "@/lib/pipeline/scoring-profile";
import { getTemplate } from "@/lib/onboarding/templates";
import type { JobSearchEdits } from "@/lib/onboarding/templates/job-search";

// The ConfirmEdits shape is job_search-specific today. When ICP/positioning
// lands, this will become a discriminated union keyed by template_id — but
// for Phase 1 there is only one template.
export type ConfirmEdits = JobSearchEdits;

export interface ConfirmResult {
  ok: boolean;
  error?: string;
}

// Test seam: the persistence body of confirmInterviewAction without the
// server-action wrappers (requireUser, revalidatePath). Scripts can exercise
// this directly with a service-role client and a known userId.
export async function performConfirm(
  svc: SupabaseClient,
  userId: string,
  interviewId: string,
  edits: ConfirmEdits,
): Promise<ConfirmResult> {
  const { data: interview, error: fetchErr } = await svc
    .from("onboarding_interviews")
    .select(
      "id, user_id, status, template_id, extracted_profile, extracted_search, extracted_outreach, extracted_insights",
    )
    .eq("id", interviewId)
    .single();

  if (fetchErr || !interview || interview.user_id !== userId) {
    return { ok: false, error: "Interview not found" };
  }

  if (interview.status !== "review") {
    return { ok: false, error: "Interview is not in review" };
  }

  const template = getTemplate(interview.template_id);

  const parsedEdits = template.editsSchema.parse(edits);

  // Reassemble the extraction shape from the 4 legacy columns. Phase 2 will
  // introduce a unified `extracted` JSONB column when a second template needs
  // a different schema shape; for now job_search's extraction decomposes
  // naturally into these 4 top-level keys.
  const extraction = {
    profile: interview.extracted_profile,
    search: interview.extracted_search,
    outreach: interview.extracted_outreach,
    insights: interview.extracted_insights,
  };

  try {
    for (const output of template.outputs) {
      if (output.type === "scoring_profile_normalize") {
        await normalizeScoringProfile(svc, userId);
        continue;
      }

      if (output.type === "memory_doc") {
        const content = output.transform({ edits: parsedEdits, extraction });
        if (content === null) continue;
        const { error } = await svc.from("memory_documents").upsert(
          {
            user_id: userId,
            document_key: output.key,
            title: output.title,
            origin: "onboarding",
            content,
            metadata: {},
          },
          { onConflict: "user_id,document_key" },
        );
        if (error) {
          throw new Error(
            `memory_doc[${output.key}] write failed: ${error.message}`,
          );
        }
        continue;
      }

      if (output.type === "pipeline_config") {
        const payload = output.transform({ edits: parsedEdits, extraction });
        if (payload === null) continue;
        // Spread first, user_id last — a misconfigured template transform
        // that emits user_id must never override the authenticated user.
        const { error } = await svc
          .from("pipeline_config")
          .upsert({ ...payload, user_id: userId }, { onConflict: "user_id" });
        if (error) {
          throw new Error(`pipeline_config write failed: ${error.message}`);
        }
        continue;
      }
    }

    const { error: confirmErr } = await svc
      .from("onboarding_interviews")
      .update({ status: "confirmed", updated_at: new Date().toISOString() })
      .eq("id", interviewId);

    if (confirmErr) {
      throw new Error(`Confirm status failed: ${confirmErr.message}`);
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Confirmation failed";
    return { ok: false, error: msg };
  }
}
