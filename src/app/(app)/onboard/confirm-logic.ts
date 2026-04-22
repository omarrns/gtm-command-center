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
    // Audit finding 6: this is a *guarded* write, not a plain UPDATE. Only
    // overwrites when current value is NULL or equal to the new value. A
    // different persona (e.g., a job_seeker confirming an ICP interview
    // out-of-band) must NOT silently re-flag the account — the only path
    // to a different user_type is the explicit reset flow (Phase 8).
    const { data: profileRow, error: profileErr } = await svc
      .from("profiles")
      .select("user_type")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileErr) {
      console.error(
        `[performConfirm] profiles read failed for user ${userId}:`,
        profileErr.message,
      );
    } else {
      const current = profileRow?.user_type as string | null | undefined;
      const target = template.userTypeOnConfirm;
      if (current && current !== target) {
        // Guard: another persona is already stamped. Log + skip; do not
        // throw — the interview's outputs already landed and the status is
        // 'confirmed'. The mismatch is recoverable via the reset flow.
        console.warn(
          `[performConfirm] skipping profiles.user_type write for user ${userId}: current='${current}' target='${target}'. Use the reset flow to switch personas.`,
        );
      } else if (current !== target) {
        const { error: personaErr } = await svc
          .from("profiles")
          .update({ user_type: target })
          .eq("user_id", userId);

        if (personaErr) {
          // Non-fatal: outputs are written and status is 'confirmed'. The
          // Phase 2.c /onboard safety net retries on next visit.
          console.error(
            `[performConfirm] profiles.user_type write failed for user ${userId}:`,
            personaErr.message,
          );
        }
      }
      // current === target: no-op, idempotent re-confirm.
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Confirmation failed";
    return { ok: false, error: msg };
  }
}
