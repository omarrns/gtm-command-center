/**
 * Testable seam for getOrCreateInterviewAction.
 *
 * Matches the performConfirm / confirmInterviewAction split: this file
 * exports a pure function that takes an injected Supabase client +
 * userId, so regression tests (scripts/test-persona-switch-artifact-
 * retention.ts) can exercise the same orphan-claim contract the server
 * action runs for real users.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTemplate } from "@/lib/onboarding/templates";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";
import { claimOrphanedArtifacts } from "@/lib/onboarding/artifacts/reassign";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";

export async function getOrCreateInterview(
  svc: SupabaseClient,
  userId: string,
  isRefresh: boolean,
  templateId: InterviewTemplateId,
): Promise<
  { ok: true; interview: OnboardingInterviewRow } | { ok: false; error: string }
> {
  const template = getTemplate(templateId);

  // Per-template scoping matches the partial unique index; different
  // templates can have concurrent active interviews for the same user.
  const { data: existing, error: existingErr } = await svc
    .from("onboarding_interviews")
    .select("*")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .in("status", ["in_progress", "extracting", "review", "story_review"])
    .maybeSingle();

  if (existingErr) {
    console.error("[getOrCreateInterview] query error:", existingErr.message);
  }

  if (existing) {
    // SPEC-3 audit (Phase 4.c gap): claim orphaned artifacts even when
    // returning an existing interview. Persona switch paths that don't
    // go through switchPersonaAction — e.g. a refresh-mode deep-link
    // into a template that already has an active interview — would
    // otherwise leave abandonInterviewAction's orphans stranded.
    const claimed = await claimOrphanedArtifacts(svc, userId, existing.id);
    if (claimed.count > 0) {
      console.log(
        `[getOrCreateInterview] claimed ${claimed.count} orphaned artifact(s) → existing interview ${existing.id}`,
      );
    }
    return { ok: true, interview: existing as OnboardingInterviewRow };
  }

  const { data: created, error } = await svc
    .from("onboarding_interviews")
    .insert({
      user_id: userId,
      is_refresh: isRefresh,
      template_id: templateId,
      template_version: template.version,
      status: "in_progress",
      messages: [],
      topics_covered: [],
    })
    .select("*")
    .single();

  if (error) {
    console.error(
      "[getOrCreateInterview] insert error:",
      error.message,
      error.details,
      error.code,
    );
    return { ok: false, error: error.message };
  }

  if (created?.id) {
    const claimed = await claimOrphanedArtifacts(svc, userId, created.id);
    if (claimed.count > 0) {
      console.log(
        `[getOrCreateInterview] claimed ${claimed.count} orphaned artifact(s) → new interview ${created.id}`,
      );
    }
  }

  return { ok: true, interview: created as OnboardingInterviewRow };
}
