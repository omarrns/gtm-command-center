interface FlagItem {
  rating: "green" | "orange" | "red";
  note: string;
}

interface Flags {
  [key: string]: FlagItem | string[];
}

const FLAG_LABELS: Record<string, string> = {
  reporting_structure: "Reporting Structure",
  builder_vs_executor: "Builder vs Executor",
  scope_clarity: "Scope Clarity",
  company_filter: "Company Filter Match",
  green: "Green Flags",
  red: "Red Flags",
  orange: "Orange Flags",
};

export function FlagCallout({ flags }: { flags: Flags }) {
  return (
    <div className="surface p-5">
      <h3 className="text-sm font-semibold mb-3">Flags</h3>
      <div className="space-y-2.5">
        {Object.entries(flags).map(([key, value]) => {
          // Array flags (green/red/orange lists)
          if (Array.isArray(value)) {
            if (!value.length) return null;
            const color =
              key === "green"
                ? "badge-success"
                : key === "red"
                  ? "badge-danger"
                  : "badge-warning";
            return (
              <div key={key}>
                <div className="text-xs font-medium mb-1.5">
                  {FLAG_LABELS[key] ?? key}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {value.map((v, i) => (
                    <span key={i} className={`badge ${color}`}>
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            );
          }

          // Object flags (rating + note)
          const flag = value as FlagItem;
          const color =
            flag.rating === "green"
              ? "badge-success"
              : flag.rating === "red"
                ? "badge-danger"
                : "badge-warning";

          return (
            <div key={key} className="flex items-start gap-2.5">
              <span className={`badge ${color} shrink-0 mt-0.5`}>
                {flag.rating.toUpperCase()}
              </span>
              <div>
                <div className="text-xs font-medium">
                  {FLAG_LABELS[key] ?? key}
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {flag.note}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
