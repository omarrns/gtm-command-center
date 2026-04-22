import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeScoringProfile } from "@/lib/pipeline/scoring-profile";
import { getTemplate } from "@/lib/onboarding/templates";
import type { JobSearchEdits } from "@/lib/onboarding/templates/job-search";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";

// Template-tagged union of confirm-edit shapes. Caller passes the right
// payload for the interview's template; performConfirm validates against
// the template's editsSchema before any output runs.
export type ConfirmEdits = JobSearchEdits | IcpEdits;

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
      "id, user_id, status, template_id, extracted, extracted_profile, extracted_search, extracted_outreach, extracted_insights",
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

  // Prefer the unified `extracted` column (written by Phase 1.b's dual-write
  // path). Fall back to reassembling from the 4 legacy columns for any row
  // that predates the dual-write. Fallback dropped in the DEFERRED cleanup
  // commit once Phase 3 stabilises in prod.
  const extraction =
    interview.extracted ??
    ({
      profile: interview.extracted_profile,
      search: interview.extracted_search,
      outreach: interview.extracted_outreach,
      insights: interview.extracted_insights,
    } as Record<string, unknown>);

  try {
    for (const output of template.outputs) {
      if (output.type === "scoring_profile_normalize") {
        // Pass template.id so the dispatcher routes to the right template's
        // normalizer (audit finding 1). Pass interviewId so the ICP
        // normalizer can read the current row regardless of status — at
        // this point the interview is still in 'review', not 'confirmed'
        // (audit finding 2).
        await normalizeScoringProfile(svc, userId, template.id, {
          interviewId,
        });
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

    // SPEC-3: write profiles.user_type from the template's declared persona.
    // This is the canonical write per the hard constraint — only at the
    // first successful confirm, never on persona-card click or pre-confirm
    // template switch. Idempotent: re-confirming the same template doesn't
    // change user_type; a different template (via reset flow, Phase 8) will
    // overwrite.
    const { error: personaErr } = await svc
      .from("profiles")
      .update({ user_type: template.userTypeOnConfirm })
      .eq("user_id", userId);

    if (personaErr) {
      // Non-fatal: the interview is already marked 'confirmed' and outputs
      // are written. user_type can be retried on the next /onboard visit
      // via Phase 2.c's safety net. Log and succeed.
      console.error(
        `[performConfirm] profiles.user_type write failed for user ${userId}:`,
        personaErr.message,
      );
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Confirmation failed";
    return { ok: false, error: msg };
  }
}
