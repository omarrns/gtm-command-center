"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowsLeftRight as ArrowLeftRight,
} from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import type { InterviewTemplateId } from "@/lib/onboarding/templates/types";
import { switchPersonaAction } from "../switch-persona";

// SPEC-3 Phase 4.d: visible switch control inside the interview flow
// (artifact drop + chat). Shows "Switch to [opposite persona]" — binary
// since SPEC-3 ships with two templates. When a third template lands,
// this becomes a menu.

const OPPOSITE: Record<InterviewTemplateId, InterviewTemplateId> = {
  job_search: "icp_definition",
  icp_definition: "job_search",
};

const LABEL: Record<InterviewTemplateId, string> = {
  job_search: "Job search",
  icp_definition: "Company ICP",
};

interface SwitchPersonaControlProps {
  interviewId: string;
  currentTemplateId: InterviewTemplateId;
}

export function SwitchPersonaControl({
  interviewId,
  currentTemplateId,
}: SwitchPersonaControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const target = OPPOSITE[currentTemplateId];
  const targetLabel = LABEL[target];

  function handleSwitch() {
    if (isPending) return;

    const confirmed = window.confirm(
      `Switch to ${targetLabel}? Your uploaded artifacts will move to the new interview. The current chat + inferences will be discarded.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await switchPersonaAction(interviewId, target);
      if (!result.ok) {
        toast.error(result.error ?? "Switch failed");
        return;
      }
      if (result.analysisFailed) {
        // Artifacts moved + source abandoned, but the target agent's
        // orchestrator_state didn't refresh. Surface loudly so the user
        // knows why the new agent might ask for things their artifacts
        // already cover. Uploading any artifact re-runs analyze.
        toast.warning(
          `Switched to ${targetLabel}, but re-analysis failed. Upload another artifact to retry, or refresh the page.`,
        );
      } else {
        toast.success(`Switched to ${targetLabel}`);
      }
      router.push(`/onboard?template=${target}`);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      disabled={isPending}
      className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50"
    >
      <ArrowLeftRight size={12} />
      {isPending ? "Switching…" : `Switch to ${targetLabel}`}
    </button>
  );
}
