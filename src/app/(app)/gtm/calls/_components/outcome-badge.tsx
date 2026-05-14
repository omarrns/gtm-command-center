import { Badge } from "@/components/ui/badge";
import type { CallOutcome } from "@/lib/calls/types";

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  ongoing: "Ongoing",
  won: "Won",
  lost: "Lost",
};

export function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  if (outcome === "won") {
    return (
      <Badge className="bg-[var(--color-success)] text-white border-[var(--color-success)]">
        {OUTCOME_LABEL[outcome]}
      </Badge>
    );
  }
  if (outcome === "lost") {
    return (
      <Badge className="bg-[var(--color-danger)] text-white border-[var(--color-danger)]">
        {OUTCOME_LABEL[outcome]}
      </Badge>
    );
  }
  return <Badge variant="outline">{OUTCOME_LABEL[outcome]}</Badge>;
}
