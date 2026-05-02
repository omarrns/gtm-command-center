"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { recordAccountOutcomeAction } from "../accounts/actions";
import type { AccountOutcome } from "../accounts/outcomes";

const OUTCOME_OPTIONS: Array<{ outcome: AccountOutcome; label: string }> = [
  { outcome: "positive_reply", label: "Positive reply" },
  { outcome: "bad_fit", label: "Bad fit" },
  { outcome: "not_icp", label: "Not ICP" },
  { outcome: "booked", label: "Booked" },
  { outcome: "manual_conversion", label: "Manual conversion" },
];

interface AccountOutcomeChipsProps {
  opportunityId: string;
  companyName: string;
}

export function AccountOutcomeChips({
  opportunityId,
  companyName,
}: AccountOutcomeChipsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function recordOutcome(outcome: AccountOutcome) {
    startTransition(async () => {
      const result = await recordAccountOutcomeAction({
        opportunityId,
        outcome,
      });

      if (result.ok) {
        toast.success(`${companyName} outcome recorded`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {OUTCOME_OPTIONS.map((option) => (
        <Button
          key={option.outcome}
          variant="outline"
          size="sm"
          className="h-7 rounded-full px-2.5 text-xs"
          disabled={isPending}
          onClick={(event) => {
            event.stopPropagation();
            recordOutcome(option.outcome);
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
