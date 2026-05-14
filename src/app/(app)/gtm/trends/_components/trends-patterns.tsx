import { cn } from "@/lib/utils";
import type { LossReason, ObjPatternMonth } from "@/lib/trends/data";

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]",
        className,
      )}
    >
      {children}
    </th>
  );
}

function HBar({
  value,
  max,
  label,
  count,
  onClick,
}: {
  value: number;
  max: number;
  label?: string;
  count: number;
  onClick?: () => void;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        onClick &&
          "cursor-pointer hover:opacity-75 transition-opacity duration-100",
      )}
      onClick={onClick}
    >
      {label && (
        <span className="text-xs text-[var(--color-text-muted)] w-32 shrink-0 truncate">
          {label}
        </span>
      )}
      <div className="flex-1 h-1.5 bg-[var(--color-surface-muted)] rounded-full overflow-hidden">
        <div
          className="h-full bg-[var(--color-blue)] rounded-full"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-[var(--color-text-muted)] w-4 text-right">
        {count}
      </span>
    </div>
  );
}

export function ObjChart({
  data,
  onTypeClick,
}: {
  data: ObjPatternMonth[];
  onTypeClick: (month: string, type: string) => void;
}) {
  const allTypes = Array.from(
    new Set(data.flatMap((month) => Object.keys(month.types))),
  );
  const globalMax = Math.max(
    ...data.flatMap((month) => Object.values(month.types)),
    1,
  );

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      {data.map((month, monthIndex) => (
        <div
          key={month.month}
          className={cn(
            "px-4 py-4",
            monthIndex < data.length - 1 && "border-b border-[var(--color-border)]",
          )}
        >
          <p className="text-xs font-semibold text-[var(--color-text-muted)] mb-3 uppercase tracking-wide">
            {month.month}
          </p>
          <div className="flex flex-col gap-2">
            {allTypes
              .filter((type) => month.types[type])
              .sort((a, b) => (month.types[b] ?? 0) - (month.types[a] ?? 0))
              .map((type) => (
                <HBar
                  key={type}
                  label={type}
                  value={month.types[type] ?? 0}
                  max={globalMax}
                  count={month.types[type] ?? 0}
                  onClick={() => onTypeClick(month.month, type)}
                />
              ))}
            {allTypes.filter((type) => month.types[type]).length === 0 && (
              <p className="text-xs text-[var(--color-text-subtle)]">
                No objections recorded
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LossTable({
  reasons,
  onRowClick,
}: {
  reasons: LossReason[];
  onRowClick: (account: string) => void;
}) {
  return (
    <TableWrap>
      <thead>
        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-muted)]">
          <Th className="text-left w-[16%]">Account</Th>
          <Th className="text-left w-[18%]">Rep</Th>
          <Th className="text-left w-[46%]">Reason</Th>
          <Th className="text-right w-[12%]">Amount</Th>
          <Th className="text-left w-[8%]">Date</Th>
        </tr>
      </thead>
      <tbody>
        {reasons.map((reason, index) => (
          <tr
            key={reason.account}
            onClick={() => onRowClick(reason.account)}
            className={cn(
              "cursor-pointer hover:bg-[var(--color-surface-muted)] transition-colors duration-100",
              "[&>td]:px-4 [&>td]:py-3 [&>td]:align-middle",
              index < reasons.length - 1 && "border-b border-[var(--color-border)]",
            )}
          >
            <td className="font-medium text-[var(--color-text)]">
              {reason.account}
            </td>
            <td className="text-[var(--color-text-muted)] truncate">
              {reason.rep}
            </td>
            <td className="text-[var(--color-text-muted)] text-xs leading-snug">
              {reason.reason}
            </td>
            <td className="text-right tabular-nums text-[var(--color-text-muted)]">
              ${reason.amount.toLocaleString()}
            </td>
            <td className="text-[var(--color-text-subtle)] whitespace-nowrap text-xs">
              {new Date(reason.date).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </td>
          </tr>
        ))}
      </tbody>
    </TableWrap>
  );
}
