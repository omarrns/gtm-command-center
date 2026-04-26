# Fix /accounts dismiss

## Goal

Make `/accounts` honor its "Dismiss to move to History" promise. Today the
page renders `AccountCard` with no skip affordance, so promoted accounts
pile up forever (violates `feedback_accounts_never_auto_remove.md` —
explicit dismissal is the _only_ way out, but the UI doesn't expose it).

## Approach

Smallest change. Extend `AccountCard` with optional `opportunityId`; when
set, render a skip button and call `skipOpportunityAction` inline. Add
`/accounts` to the revalidate set so the page actually shows the
post-skip state.

Single component, two consumers — `/activate` keeps using it as a static
preview by simply not passing `opportunityId`. No new wrapper file.

## Changes

### `src/app/(app)/_components/account-card.tsx`

- Convert from pure display to action-aware. Already `"use client"` so
  no boundary change.
- Add two optional props to `AccountCardProps`:
  - `opportunityId?: string` — the row to dismiss
  - `canSkip?: boolean` — whether the current stage allows it
- Render the dismiss button only when both are truthy. This keeps the
  button off terminal-stage rows (sent / replied / sending) so we never
  ship a button that visibly fails. Today every row on /accounts is
  scored, so every card gets the button; the gate is forward-looking.
- Button: small ghost icon top-right next to the score, `<X>` from
  lucide-react at size 14. Understated — fade-out gesture, not a CTA.
- Click handler: `useTransition` → `skipOpportunityAction(opportunityId)`
  → on success, `toast.success` + `router.refresh()`; on failure,
  `toast.error(result.error)`. **`router.refresh()` is required** —
  `revalidatePath` invalidates the server cache for the next render
  but doesn't drop the row from the current client view. We need the
  explicit refresh to re-fetch the RSC tree. Disable the button while
  pending.

### `src/app/(app)/actions.ts`

- Export `SKIPPABLE_STAGES` so the page can derive `canSkip` from a
  single source of truth (it's currently a private const at line 213).
- `skipOpportunityAction` (line 268): add `revalidatePath("/accounts")`
  after the existing `revalidatePath("/")`. Keeps subsequent navigations
  fresh independent of the in-page client refresh.
- `flagCompanyAction` (line 386): same. Flag = dismiss-with-watchlist;
  same /accounts refresh contract.
- Order doesn't matter; both calls are idempotent.

### `src/app/(app)/accounts/page.tsx`

- Import `SKIPPABLE_STAGES` from `../actions`.
- Pass `opportunityId={o.id}` and `canSkip={SKIPPABLE_STAGES.includes(o.stage as OpportunityStage)}`
  to `<AccountCard>` at line 119.

## Verification

1. **Manual** — start dev server, load `/accounts`, click Dismiss on a
   row. Card should disappear immediately (router.refresh fires after
   the action resolves); `/history` should show the row with
   `stage=skipped`. If any terminal-stage rows exist (sent / replied /
   sending), confirm they render _without_ a Dismiss button — that's
   the canSkip gate working.
2. `npm run typecheck` — expect green.
3. `npm run test:pipeline-regression` — already exercises stage
   transitions; expect green.
4. No new fixtures needed.

## Out of scope (separate decisions)

- **P1: `SKIPPABLE_STAGES` excludes `sent`/`replied` while page query
  includes them.** Only matters once the GTM lane gains a draft/send
  step. Defer the widen-vs-narrow call until then.
- **P1: `pipelineWorkflow` runs on GTM users via `/api/cron/pipeline`.**
  Separate routing fix; doesn't block dismiss.
- **P2: page silently swallows DB errors as empty state.** Trivial
  follow-up — destructure `error`, log, render an `<Alert>` banner.
- **P2: `company_domain` casing inconsistent across lanes.** Latent
  dedup risk; fix at `createOpportunity` boundary in a follow-up.

## Risk

Low. AccountCard already runs as a client component; we're adding one
button + one server-action call. Existing skip path is well-tested via
OpportunityCard; same action, same RPC, same precondition check. The
only behavioral change at /activate is "no `opportunityId` passed", which
keeps the card visually identical to today.
