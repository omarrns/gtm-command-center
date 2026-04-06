"use client";

interface RequirementMatch {
  requirement: string;
  status: "STRONG MATCH" | "PARTIAL MATCH" | "GAP";
  evidence: string;
  notes: string;
}

export function RequirementTable({ matches }: { matches: RequirementMatch[] }) {
  return (
    <div className="surface overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold">
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
              <span
                className={`badge shrink-0 ${
                  m.status === "STRONG MATCH"
                    ? "badge-success"
                    : m.status === "PARTIAL MATCH"
                      ? "badge-warning"
                      : "badge-danger"
                }`}
              >
                {m.status}
              </span>
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
    </div>
  );
}
