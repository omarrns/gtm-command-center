# Plan — Unify /accounts with Today/History via shadcn primitives

## Context

The `/accounts` (GTM) surface looks visually different from `/` (Today, job_seeker) and `/history` because three things drifted:

1. **Container width** — `accounts/page.tsx` wraps content in `mx-auto max-w-2xl px-6 py-10`, double-nesting inside the AppShell's `max-w-6xl` (`src/components/app-shell.tsx:69`). Today and History inherit shell width directly.
2. **Card primitive** — `account-card.tsx` uses `<div className="surface p-4 space-y-3">` (a hand-rolled utility from `globals.css`). `opportunity-card.tsx:148-154` uses the shadcn `<Card>` from `src/components/ui/card.tsx`. Different border, ring, radius, padding semantics.
3. **No progressive disclosure** — `OpportunityCard` has a chevron-collapse (`opportunity-card.tsx:195-217`) hiding research/drafts/errors. AccountCard renders everything always-on, producing a 12+ row stack.

The audit also surfaced wider drift the user explicitly wants fixed under "shadcn primitives should always be in the app":

- 40+ files use `<div className="surface ...">` instead of `<Card>` (analysis views, research detail, settings sections, today-metrics-row, account-card).
- 2 raw `<select>` elements bypass shadcn `<Select>` (`history-client.tsx:136-149`, `calls-client.tsx:137-148`).
- Two filter bars (`today-filter-bar.tsx` and the inline one in `history-client.tsx`) share Min/Max Score + Company fields but were never extracted; `/accounts` has zero filtering UI.

DESIGN.md mandates: shadcn/ui is the component library; "Consistency is kindness — extract and reuse, never duplicate"; anti-patterns include "stacked wrappers, too many bordered containers"; "Cards are for truly distinct, actionable units" and "Never nest cards inside cards".

The intended outcome: every queue/list/detail surface in the app shares the same shadcn-native chrome, so /accounts reads as the GTM analog of /history with no learnable visual difference.

## Approach

Three phases, each shippable as its own commit on the working branch (per `feedback_refactor_granularity.md`).

---

### Phase 1 — `/accounts` visual parity (the immediate ask)

**Files:**

- `src/app/(app)/accounts/page.tsx`
- `src/app/(app)/_components/account-card.tsx`
- `src/app/(app)/activate/_components/account-result-card.tsx` (verify only — read-only impact check)

**Changes:**

1. **Drop the narrow wrapper.** Remove `mx-auto max-w-2xl px-6 py-10` at `accounts/page.tsx:63, 156, 170` (error / empty / main branches). Inherit AppShell's `max-w-6xl`. The activation preview keeps its own `max-w-2xl` parent (`activation-client.tsx:179, 322`) so /activate's narrative density is unaffected.

2. **Swap `surface` for shadcn `<Card>`.** Replace AccountCard's outer `<div className="surface p-4 space-y-3">` with `<Card className="gap-0 p-4 motion-safe:transition-[box-shadow] motion-safe:duration-200 motion-safe:ease-out">` — mirrors `opportunity-card.tsx:148-154`. Add `space-y-3` via inner `<div>` since `<Card>` provides its own `gap-4` (we want `gap-0` like OpportunityCard).

3. **Add chevron-collapse.** Adopt the pattern from `opportunity-card.tsx:195-217` (chevron button + `isExpanded` state) and `:312-318` (grid-rows-[1fr]/[0fr] transition). Always-visible: company header, score+verdict, reason_to_believe, Why now line, chip row (hiring role, funding stage, employees, industry, discoveredAt). Behind the chevron: ContactPanel + Find-contacts button. The `hasExpandableContent` check should fire when `contacts.length > 0 || showFindContacts`.

**DESIGN.md alignment:**

- Data density over decoration → collapse the panel that pushes the card to 12+ rows.
- Consistency is kindness → same Card primitive as OpportunityCard.
- Never nest cards in cards → the `surface`-styled box is dropped; the shadcn `<Card>` becomes the single boundary.

**Verification:**

- `npm run dev` → `/accounts` fills the shell width, card chrome matches `/history`, chevron toggles the contact panel.
- `/activate` preview keeps narrow width (parent's `max-w-2xl`); AccountCard renders inside it without its own width cap.
- `npx tsc --noEmit` clean.
- `npm run lint` (changed files only) — no new errors.
- `npm run test:correctness` passes.

---

### Phase 2 — Shared queue filter bar (shadcn-native)

**New file:** `src/app/(app)/_components/queue-filter-bar.tsx`

**Files modified:**

- `src/app/(app)/_components/today/today-filter-bar.tsx` (delete or thin-wrap the new shared one)
- `src/app/(app)/history/history-client.tsx` (replace inline filter form, migrate raw `<select>` to shadcn `<Select>`)
- `src/app/(app)/accounts/page.tsx` + new `src/app/(app)/accounts/actions.ts` server action for filtered query

**Shape:**

```tsx
<QueueFilterBar
  companySearch={...} onCompanySearchChange={...}
  minScore={...} maxScore={...}
  onApply={...} onReset={...}
  leftSlot={/* discovered-window pill OR stage <Select> OR tier <Select> */}
/>
```

The shared bar owns Min Score, Max Score, Company search, Apply, Clear. The `leftSlot` accepts the call-site's stage/window/tier control.

**Migrations bundled with this phase:**

- `history-client.tsx:136-149` raw `<select>` → shadcn `<Select>` from `src/components/ui/select.tsx`. Verify by reading that file first to confirm exports (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`).
- `/accounts` gets a Tier (A/B/C) + Source (theirstack/exa-dormant) `<Select>` pair in its `leftSlot`.

**DESIGN.md alignment:**

- Consistency is kindness → one filter component across three surfaces.
- shadcn primitives should always be in the app → raw `<select>` replaced with `<Select>`.

**Verification:**

- Visual parity: filter bar on /today, /history, /accounts looks identical except for the leftSlot.
- `/history` still filters via server roundtrip; `/accounts` and `/today` filter client-side.
- Stage filter on /history works exactly as before (drop-down identical, server action unchanged).

---

### Phase 3 — Sweep `<div className="surface">` → `<Card>` across the app

**Scope:** ~40 files. Land as one commit per directory cluster to keep diffs reviewable.

**Clusters:**

- `src/app/(app)/analysis/_components/views/` — `standard-analysis-view.tsx`, `company-fit-view.tsx`
- `src/app/(app)/research/reports/[id]/research-detail.tsx`
- `src/app/(app)/settings/_components/` (5 files: settings-\* sections)
- `src/app/(app)/_components/today/today-metrics-row.tsx`
- Any remaining `grep -rn 'className="surface'` matches

**Mechanical pattern:**

```diff
- <div className="surface p-5 space-y-4">
+ <Card className="gap-4 p-5">
```

The `surface-muted` variant (`research-detail.tsx`) maps to a `<Card>` with a muted background utility — confirm by reading `globals.css` to see how `surface-muted` is defined, then choose between a `Card` with a `bg-muted` className or a `data-slot` variant.

**Intentionally not touched** (per CLAUDE.md):

- `src/components/command-palette.tsx`, `lazy-command-palette.tsx`, `sidebar-nav.tsx` — own custom motion + LayoutGroup.
- `src/components/ai-elements/` — vendored upstream.
- `src/app/(app)/onboard/_components/artifact-input.tsx` — bespoke upload textarea with autoResize logic.
- `src/components/ui/` — those ARE the primitives.

**Codify forward.** Add to CLAUDE.md under "Shared UI Patterns":

> Surfaces use `<Card>` from `src/components/ui/card.tsx`. The `surface` / `surface-muted` utilities in `globals.css` are deprecated for new code; existing call sites are being migrated. Do not add new ones.

**Verification:**

- `grep -rn 'className="surface' src/` returns zero matches (except `globals.css` definitions which can stay until the deprecation completes).
- Visual diff each migrated page side-by-side. Card chrome should be uniform across analysis, research, settings, today-metrics, accounts, today, history.
- `calls-client.tsx:137-148` raw `<select>` migrated to shadcn `<Select>` while in this neighborhood.

---

## Files to modify (consolidated)

**Phase 1 (immediate):**

- `src/app/(app)/accounts/page.tsx`
- `src/app/(app)/_components/account-card.tsx`

**Phase 2:**

- new `src/app/(app)/_components/queue-filter-bar.tsx`
- `src/app/(app)/_components/today/today-filter-bar.tsx`
- `src/app/(app)/history/history-client.tsx`
- `src/app/(app)/accounts/page.tsx`
- `src/app/(app)/accounts/actions.ts`

**Phase 3:**

- 40+ files across `analysis/`, `research/`, `settings/`, `today/today-metrics-row.tsx`, `calls/`, plus AccountCard inner blocks if any
- `CLAUDE.md` (forward rule)

## Existing utilities to reuse — do not duplicate

- `<Card>` — `src/components/ui/card.tsx`
- `<Select>` — `src/components/ui/select.tsx` (verify exports before importing)
- `<Input>`, `<Button>`, `<Badge>`, `<Alert>` — `src/components/ui/*`
- `<FadeIn>` — `src/components/ui/fade-in.tsx` (already wrapping all three pages)
- Chevron-collapse pattern — `src/app/(app)/_components/opportunity-card.tsx:195-217` + `:312-318`
- `scoreColor()` — `opportunity-card.tsx:34-41` (lift to shared if AccountCard adopts the same color logic)
- `STAGE_CONFIG` — `src/app/(app)/_components/stage-config.ts`
- `formatRelativeTime` — `src/lib/utils.ts`
- `groupByDate` — `src/app/(app)/_loaders/today-queue.ts` (consider grouping /accounts by discovery date in a follow-up)

## Verification (end-to-end)

After each phase commit:

1. `npx tsc --noEmit` exits 0.
2. `npm run lint` shows no new errors on changed files.
3. `npm run test:correctness` — 22/22 passes (regression guard for pipeline behavior).
4. `npm run dev` → walk through `/`, `/history`, `/accounts`, `/activate`, `/analysis/[id]`, `/research/reports/[id]`, `/settings`. Card chrome, padding, and ring should look identical across all surfaces. Filter bar UI matches across `/today`, `/history`, `/accounts` after Phase 2.
5. Phase 3 final check: `grep -rn 'className="surface' src/ | grep -v ui/ | grep -v ai-elements/` returns zero matches.

## Out of scope

- Generalizing OpportunityCard + AccountCard into a shared `<PipelineCard>` render-prop component. Bigger refactor; Phase 1 stays surgical.
- Changing data loaders or pipeline behavior — read paths stay identical.
- Touching `command-palette.tsx`, `sidebar-nav.tsx`, `ai-elements/`, `artifact-input.tsx` — deliberately custom.
- Adding date grouping to `/accounts` (logged as follow-up; uses the existing `groupByDate` helper if pursued).
