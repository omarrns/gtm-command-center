import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface RequirementMatch {
  requirement: string;
  status: "STRONG MATCH" | "PARTIAL MATCH" | "GAP";
  evidence: string;
  notes: string;
}

export function RequirementTable({ matches }: { matches: RequirementMatch[] }) {
  return (
    <Card className="gap-0 py-0">
      <div className="px-5 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
          Requirement Matches ({matches.length})
        </h3>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {matches.map((m, i) => (
          <div key={i} className="px-5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-medium leading-relaxed flex-1">
                {m.requirement}
              </div>
              <Badge
                className="shrink-0"
                variant={
                  m.status === "STRONG MATCH"
                    ? "success"
                    : m.status === "PARTIAL MATCH"
                      ? "warning"
                      : "destructive"
                }
              >
                {m.status}
              </Badge>
            </div>
            {m.evidence && (
              <div className="text-xs text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
                <strong>Evidence:</strong> {m.evidence}
              </div>
            )}
            {m.notes && (
              <div className="text-xs text-[var(--color-text-subtle)] mt-1 leading-relaxed">
                {m.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
