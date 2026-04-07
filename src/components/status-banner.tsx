import { RefreshCw } from "lucide-react";

interface StatusBannerProps {
  status: "running" | "failed";
  title: string;
  detail?: string;
}

export function StatusBanner({ status, title, detail }: StatusBannerProps) {
  if (status === "running") {
    return (
      <div className="surface-muted flex items-center gap-3 p-5 mb-6">
        <RefreshCw
          size={16}
          className="animate-spin text-[var(--color-blue)]"
        />
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {detail && (
            <div className="text-xs text-[var(--color-text-muted)]">
              {detail}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="surface p-5 mb-6 border-[var(--color-danger)]">
      <div className="text-sm font-semibold text-[var(--color-danger)]">
        {title}
      </div>
      {detail && (
        <div className="text-xs text-[var(--color-text-muted)] mt-1">
          {detail}
        </div>
      )}
    </div>
  );
}
