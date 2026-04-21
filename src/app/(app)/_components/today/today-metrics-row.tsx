import { Badge } from "@/components/ui/badge";
import {
  sentTodayColor,
  scoreAvgColor,
  type DashboardMetrics,
} from "../today-helpers";
import { STAGE_CONFIG } from "../stage-config";

interface TodayMetricsRowProps {
  metrics: DashboardMetrics;
  scoreThreshold: number;
}

export function TodayMetricsRow({
  metrics,
  scoreThreshold,
}: TodayMetricsRowProps) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="surface px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">Reply Rate</p>
          <p className="text-lg font-semibold tabular-nums">
            {metrics.replyRate != null ? (
              <>
                {metrics.replyRate}
                <span className="text-xs font-normal text-[var(--color-text-subtle)] ml-0.5">
                  %
                </span>
              </>
            ) : (
              <span className="text-[var(--color-text-subtle)]">—</span>
            )}
          </p>
        </div>
        <div className="surface px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">Sent Today</p>
          <p className="text-lg font-semibold tabular-nums">
            <span
              className={sentTodayColor(metrics.sentToday, metrics.dailyCap)}
            >
              {metrics.sentToday}
            </span>
            <span className="text-xs font-normal text-[var(--color-text-subtle)] ml-0.5">
              / {metrics.dailyCap}
            </span>
          </p>
        </div>
        <div className="surface-muted px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">
            Sent This Week
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {metrics.sentThisWeek}
          </p>
        </div>
        <div className="surface-muted px-3 py-2.5">
          <p className="text-xs text-[var(--color-text-subtle)]">Avg Score</p>
          <p className="text-lg font-semibold tabular-nums">
            {metrics.avgScore != null ? (
              <span className={scoreAvgColor(metrics.avgScore, scoreThreshold)}>
                {metrics.avgScore}
              </span>
            ) : (
              <span className="text-[var(--color-text-subtle)]">—</span>
            )}
          </p>
        </div>
      </div>

      {metrics.funnel.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 mb-3 px-0.5">
          <span className="text-xs font-medium text-[var(--color-text-subtle)] mr-1">
            Pipeline
          </span>
          {metrics.funnel.map((s) => (
            <Badge
              key={s.stage}
              variant={STAGE_CONFIG[s.stage]?.variant ?? "secondary"}
            >
              {STAGE_CONFIG[s.stage]?.label ?? s.stage}{" "}
              <span className="font-semibold">{s.count}</span>
            </Badge>
          ))}
        </div>
      )}
    </>
  );
}
