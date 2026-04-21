---
name: Opportunity Card Scoring
overview: ""
todos:
  - id: load-threshold
    content: Load `score_threshold` and thread it through Today, History, and Activation into `OpportunityCard` as a required prop.
    status: completed
  - id: update-color-logic
    content: "Replace fixed OpportunityCard score bands with explicit semantics: `>= 80` green, `>= score_threshold` yellow, `< score_threshold` muted gray."
    status: completed
  - id: decide-breakdown-ui
    content: Keep cards composite-only; use the existing `View full analysis` link for breakdowns and leave `score_components` documented as redundant/unused.
    status: completed
  - id: verify-ui-behavior
    content: Validate Today, History, and Activation card behavior and run lint checks on touched files.
    status: completed
isProject: false
---

# Opportunity Card Scoring Plan

## Goals

- Make `OpportunityCard` score color semantics match the user’s configured pass/fail threshold instead of fixed `80/60` bands.
- Keep card UI focused on the composite score and preserve the analysis detail page as the canonical breakdown view.

## Recommended scope

- Treat threshold alignment as the primary fix.
- Do not add score breakdown UI to cards. Keep the current `View full analysis` link as the path to `jd_fit` and `strategic_fit` detail, and leave `score_components` explicitly unused for now.

## Implementation approach

### 1. Thread `score_threshold` into card rendering

- Update the Today page loader in [`/Users/omarnasser/andrew_gai/gtm-command-center/src/app/(app)/page.tsx`] to also load `pipeline_config.score_threshold` alongside the existing queue data.
- Pass that value through [`/Users/omarnasser/andrew_gai/gtm-command-center/src/app/(app)/_components/today-client.tsx`] into [`/Users/omarnasser/andrew_gai/gtm-command-center/src/app/(app)/_components/opportunity-card.tsx`].
- Plumb the same required `scoreThreshold` prop through History in [`/Users/omarnasser/andrew_gai/gtm-command-center/src/app/(app)/history/history-client.tsx`].
- Plumb the same required `scoreThreshold` prop through Activation in [`/Users/omarnasser/andrew_gai/gtm-command-center/src/app/(app)/activate/_components/activation-client.tsx`], using the threshold the activation server already reads in [`/Users/omarnasser/andrew_gai/gtm-command-center/src/lib/pipeline/activation.ts`].
- Make `scoreThreshold` a required prop on `OpportunityCard` so TypeScript forces every caller to provide it.

Essential current snippets:

```83:84:src/lib/pipeline/steps/score.ts
const passesThreshold = scoring.normalizedScore >= config.score_threshold;
const newStage = passesThreshold ? "scored" : "filtered";
```

```32:36:src/app/(app)/_components/opportunity-card.tsx
if (score == null) return "text-[var(--color-text-muted)]";
if (score >= 80) return "text-[var(--color-success)]";
if (score >= 60) return "text-[var(--color-warning)]";
return "text-[var(--color-danger)]";
```

### 2. Redefine card color semantics

- Replace the fixed `80/60` helper in [`/Users/omarnasser/andrew_gai/gtm-command-center/src/app/(app)/_components/opportunity-card.tsx`] with these exact bands:
- `>= 80` -> success/green, preserving the existing auto-watchlist semantic from [`/Users/omarnasser/andrew_gai/gtm-command-center/src/lib/pipeline/steps/score.ts`].
- `>= score_threshold` and `< 80` -> warning/yellow.
- `< score_threshold` -> muted gray, explicitly replacing the current danger/red branch.
- Keep colors stable and absolute; avoid relative queue-percentile buckets so the same score does not change meaning day to day.

### 3. Make a deliberate call on score breakdowns

- Keep cards composite-only and rely on the existing `View full analysis` link for breakdowns.
- Do not render `opportunities.score_components` on the card; the detailed `jd_fit` and `strategic_fit` scorecards already come from `analysis.result` in [`/Users/omarnasser/andrew_gai/gtm-command-center/src/app/(app)/analysis/[id]/analysis-detail.tsx`].
- Document `score_components` as redundant persistence left unused for now. If cleanup is in scope later, consider removing the write in [`/Users/omarnasser/andrew_gai/gtm-command-center/src/lib/pipeline/steps/score.ts`].

### 4. Verify behavior

- Check that Today cards with scores just above the configured threshold no longer look like poor matches.
- Check that sub-threshold scores render muted gray rather than danger/red.
- Confirm History cards use the current threshold for recoloring, even if some rows were originally scored under an older threshold.
- Confirm Activation’s `Close match` badge still reads sensibly alongside the new color logic.
- Verify the analysis detail page remains the canonical place for full `jd_fit` and `strategic_fit` scorecards.
- Run lint checks on the edited UI files after implementation.
