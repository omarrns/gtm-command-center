# Plan: Color semantic fixes for Today dashboard

## Context

Three color choices in the current UI send wrong signals:

1. **Score color for threshold-qualifying roles uses `--color-warning` (amber).** Amber means "caution/problem." But a score above your threshold means "this role qualifies — proceed." It's a positive signal that should read as blue (proceed), not amber (caution).

2. **All section headers look identical regardless of urgency.** The "READY TO SEND" section (queued stage) needs your approval action right now, but its header uses the same `--color-text-subtle` gray as "SCORED" which needs nothing.

3. **Avg Score stat has no color context.** It's a plain number. When the pipeline average clears your threshold, that's worth signaling.

---

## Changes

### 1. `opportunity-card.tsx:36` — score color ramp

Replace warning amber with blue for above-threshold scores.

```ts
// Before
function scoreColor(score: number | null, threshold: number): string {
  if (score == null) return "text-[var(--color-text-muted)]";
  if (score >= 80) return "text-[var(--color-success)]";
  if (score >= threshold) return "text-[var(--color-warning)]"; // ← amber = wrong
  return "text-[var(--color-text-muted)]";
}

// After
function scoreColor(score: number | null, threshold: number): string {
  if (score == null) return "text-[var(--color-text-muted)]";
  if (score >= 80) return "text-[var(--color-success)]";
  if (score >= threshold) return "text-[var(--color-blue)]"; // ← blue = qualifies
  return "text-[var(--color-text-muted)]";
}
```

Result: green = exceptional (80+), blue = qualifies (≥threshold), gray = below threshold. Semantically consistent with the rest of the app (blue = actionable/active, not cautionary).

---

### 2. `today-client.tsx:371-376` — section header accent for queued stage

Make the "READY TO SEND" section header blue, and its count blue too. All other stages stay subtle gray.

```tsx
// Before (both h3 and count use --color-text-subtle regardless of stage)
<h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-subtle)]">
  {STAGE_CONFIG[group.stage].label}
</h3>
<span className="text-xs font-semibold text-[var(--color-text-subtle)] tabular-nums">
  {group.items.length}
</span>

// After
<h3 className={cn(
  "text-xs font-semibold uppercase tracking-wider",
  group.stage === "queued"
    ? "text-[var(--color-blue)]"
    : "text-[var(--color-text-subtle)]",
)}>
  {STAGE_CONFIG[group.stage].label}
</h3>
<span className={cn(
  "text-xs font-semibold tabular-nums",
  group.stage === "queued"
    ? "text-[var(--color-blue)]"
    : "text-[var(--color-text-subtle)]",
)}>
  {group.items.length}
</span>
```

---

### 3. `today-client.tsx:191-199` — colorize Avg Score stat

Apply the same score color logic to the Avg Score metric card so it reflects pipeline health at a glance.

```tsx
// Before
<p className="text-lg font-semibold tabular-nums">
  {metrics.avgScore != null ? (
    metrics.avgScore
  ) : (
    <span className="text-[var(--color-text-subtle)]">—</span>
  )}
</p>

// After
<p className="text-lg font-semibold tabular-nums">
  {metrics.avgScore != null ? (
    <span className={scoreAvgColor(metrics.avgScore, scoreThreshold)}>
      {metrics.avgScore}
    </span>
  ) : (
    <span className="text-[var(--color-text-subtle)]">—</span>
  )}
</p>
```

Add a `scoreAvgColor` helper above `TodayClient` (same logic as `scoreColor` in opportunity-card but without the null branch since we already guard it):

```ts
function scoreAvgColor(avg: number, threshold: number): string {
  if (avg >= 80) return "text-[var(--color-success)]";
  if (avg >= threshold) return "text-[var(--color-blue)]";
  return "";
}
```

---

## Files to modify

- `src/app/(app)/_components/opportunity-card.tsx` (line 36)
- `src/app/(app)/_components/today-client.tsx` (lines 191-199, 371-376; add helper above component)

## Verification

Run `npm run dev` and open Today page. Check:

- Scores 80+ → green text
- Scores ≥threshold but <80 → blue text (was amber)
- Scores below threshold → gray text
- "READY TO SEND" section header and count → blue
- "SCORED" section header → stays gray
- Avg Score in stats bar → green/blue/plain depending on value
