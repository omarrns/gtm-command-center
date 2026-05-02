"use client";

import { PaperPlaneTilt } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { OpportunityStage } from "@/lib/supabase/types";
import { approveOpportunityAction } from "../actions";
import { canApproveAccountDraft } from "./account-card-draft-section-helpers";

interface AccountCardDraftSectionProps {
  latestDraft: {
    id: string;
    subject: string;
    body: string;
  };
  opportunityId?: string;
  recipientEmail?: string | null;
  stage: OpportunityStage;
}

export function AccountCardDraftSection({
  latestDraft,
  opportunityId,
  recipientEmail,
  stage,
}: AccountCardDraftSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const showApprove = canApproveAccountDraft({
    draftId: latestDraft.id,
    opportunityId,
    recipientEmail,
    stage,
  });

  function handleApprove() {
    if (!opportunityId) return;
    startTransition(async () => {
      const result = await approveOpportunityAction(opportunityId);
      if (result.ok) {
        toast.success("Email approved and sent");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-[var(--color-text-muted)]">
          Draft email
        </h4>
        {showApprove && (
          <Button size="sm" onClick={handleApprove} disabled={isPending}>
            <PaperPlaneTilt size={13} />
            Approve
          </Button>
        )}
      </div>
      <div className="rounded-md bg-[var(--color-surface-muted)] p-3 space-y-2">
        <p className="font-mono text-xs font-semibold break-words">
          {latestDraft.subject}
        </p>
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-sans text-[var(--color-text-muted)]">
          {latestDraft.body}
        </pre>
      </div>
    </div>
  );
}
