# Persona Picker Redesign

## Goal

Replace the current "What are we setting up?" screen with a calmer, more confident first-screen that reads like Linear's onboarding — dense, keyboard-first, monochrome, no marketing-glass. Earn the user's attention with hierarchy and information, not gradients or animation.

Scope is one screen: `/onboard` when `interview === null` and no `?template=` param is set. Edits one file: `src/app/(app)/onboard/_components/persona-picker.tsx`. May introduce one tiny sibling client component for the keyboard handler.

## Why the current screen falls flat

- "What are we setting up?" is procedural. No greeting, no product promise, no "you."
- "Switchable until you confirm" leaks an engineering constraint into UX.
- Two equally-weighted, copy-only cards. No preview of the destination, no mono cue, no scannable difference.
- Vast empty viewport reads like a 404, not a moment.

## Design-system constraints (non-negotiable)

From `DESIGN.md` and `CLAUDE.md`:

- **Anti-patterns explicitly listed:** gradient-heavy UI, decorative glass/glow, decorative icon boxes, oversized accent colors. Earlier "dark gradient marquee" idea is out.
- **Calm, precise, confident.** Linear is the reference. Quiet authority.
- **Use existing primitives.** `<Card>`, `<Badge>`, `<FadeIn>`, `<kbd>` — never `className="surface"` or raw classes for primitives. Replace the `surface` div in the current code with `<Card>`.
- **Color rule:** blue is reserved for interaction/focus only. No accent fills on the cards themselves.
- **Typography:** `text-xl` page title cap, `text-sm` body, `text-xs` metadata, Geist Mono only for keyboard hints / system readouts.
- **Motion:** 120–200ms ease-out. `<FadeIn>` is the sanctioned page entrance. No spring theatrics on entry. Hover-lift `-translate-y-0.5` is already idiomatic in the codebase.
- **Density over decoration.** Information beats illustration.

## Target screen — what it looks like

Single column, centered, ~640px wide. Vertical rhythm:

1. **Greeting block** — top of the viewport, not centered.
   - `text-xl font-semibold tracking-tight` — `Let's set up your command center.`
   - `text-sm text-muted-foreground` — `Two paths in. You can switch until you confirm.` (keeps the constraint but stops apologizing).
2. **Two `<Card>`s** in a `grid sm:grid-cols-2 gap-3` (matches existing spacing).
   - Each card has:
     - **Mono index** in the top-right (`text-xs font-mono text-muted-foreground`): `01` / `02`. This is the Linear-style cue — system-readout feel without spending a color.
     - **Lucide icon** at 16px, muted, inline-left of the title: `Search` for job search, `Building2` for company. Bare icon, no box (design rule).
     - **Title** — `text-base font-medium` — reframed in user voice:
       - `I'm looking for my next role`
       - `I'm running GTM at a company`
     - **One-line description** — `text-xs text-muted-foreground`:
       - `Score roles, research contacts, draft outreach.`
       - `Score accounts, define ICP, run dormant sweeps.`
     - **System-readout preview** — three lines, `text-xs font-mono text-muted-foreground`, separated by `·`:
       - Job search: `Today queue · scored roles · drafted outreach`
       - Company: `Account list · ICP rubric · weekly dormant sweep`
   - Hover: `motion-safe:hover:-translate-y-0.5` (already in code), 150ms ease-out, ring goes from `ring-foreground/10` to `ring-foreground/20`. No shadow growth — keeps it flat-Linear, not floaty-Stripe.
   - Focus ring: `ring-2 ring-[var(--color-blue)]` (existing pattern).
3. **Keyboard hint row** below the cards.
   - `text-xs font-mono text-muted-foreground` — `Press` `<kbd>1</kbd>` `or` `<kbd>2</kbd>` `to choose · Esc to cancel` (Esc no-ops here, but documents the keyboard contract).
   - `<kbd>` styling already exists in the app — reuse.

Wrap the whole thing in `<FadeIn>`. That's the only entrance motion.

## File-level changes

### `src/app/(app)/onboard/_components/persona-picker.tsx` (rewrite)

- Convert the inner `PersonaCard` from a styled `<Link>` to a `<Link>` containing `<Card>` (`size="sm"`).
- Drop the `surface` className. Drop the hand-rolled `transition-[transform,box-shadow,border-color]` — `<Card>` + `motion-safe:hover` covers it.
- Keep the Server Component shape — no `"use client"` on the picker itself.
- Pass the same `href` math (`?template=...&mode=refresh`).

### `src/app/(app)/onboard/_components/persona-picker-keyboard.tsx` (new, ~25 lines)

- `"use client"`. One `useEffect` that listens for `1` / `2` and calls `router.push(href1 | href2)`.
- Receives the two hrefs as props from the server component.
- Guard with `useReducedMotion()` — not for motion, but to skip if the user is interacting with form inputs (none here, but matches the pattern).
- Returns the keyboard-hint row JSX so the indicator and the handler ship together. (Co-locating the hint with the listener prevents the hint from drifting out of sync with the actual binding.)

No other files change. No new components in `src/components/ui/`. No new tokens in `globals.css`.

## Step plan

1. **Phase 0 — verify baseline.** Boot dev server, log in as the test account, confirm `/onboard` shows the current picker. Screenshot for the before. → verify: screenshot saved locally; current copy reproduces.
2. **Phase 1 — copy + structure.** Edit `persona-picker.tsx`: new H1, new subhead, replace `surface` with `<Card>`, add mono index + icon + readout line. No keyboard yet. → verify: visual diff matches the spec above; persona links still route correctly to `?template=job_search` and `?template=icp_definition`; refresh-mode suffix preserved.
3. **Phase 2 — keyboard handler.** Add `persona-picker-keyboard.tsx`, wire `1` / `2`, render the hint row. → verify: pressing 1 navigates to job-search template, 2 navigates to ICP template; Esc no-op; ignores keypresses if focus is in a future input (defensive guard via `event.target instanceof HTMLInputElement` check).
4. **Phase 3 — motion + a11y pass.** Wrap in `<FadeIn>` if not already inherited from a parent layout. Confirm focus ring is visible on tab. Confirm `prefers-reduced-motion` skips the hover lift via `motion-safe:` prefix (already idiomatic). → verify: tab order is H1 → Card 1 → Card 2; reduced-motion media query disables transform.
5. **Phase 4 — full-mode review.** View in light + dark mode. Confirm dark mode uses `oklch(1 0 0 / 10%)` alpha border via `<Card>`'s `ring-foreground/10` — should already work. Mobile: `grid` collapses to single column. → verify: no contrast regressions; mobile layout doesn't truncate.

## Out of scope (explicit)

- No animated marquee, ticker, or rotating system-readout. Tempting, but DESIGN.md anti-pattern. The static three-line readout per card carries the same signal without flash.
- No left-column visual / hero illustration. Single column matches the rest of the app's calm density.
- No changes to `OnboardRouter`, `OnboardClient`, `InterviewClient`, or any post-pick state. The handoff into the chat interview is unchanged.
- No new shared primitive. The mono-index + icon + readout pattern is one screen — not enough repetitions to justify extracting per CLAUDE.md's "extract after 3" rule.
- No A/B test or copy variants. Single shipped version.

## Risks and mitigations

- **Risk:** keyboard handler conflicts with browser default 1/2 shortcuts (none in app context, but extensions may bind them). **Mitigation:** check `event.target` against form/input elements before acting; use `event.code === 'Digit1'` so it works regardless of locale.
- **Risk:** the readout lines feel like marketing fluff. **Mitigation:** they are concrete product surfaces — `Today queue`, `ICP rubric`, etc. — names the user will see five minutes later in the actual nav. Reuses the existing nomenclature, not invented copy.
- **Risk:** Esc binding implies a cancel destination that doesn't exist. **Mitigation:** drop the `Esc to cancel` half of the hint. Just `1` / `2`.
- **Risk:** the icon-next-to-title pattern doesn't appear elsewhere in the onboard flow. **Mitigation:** it's a one-screen affordance, not a system pattern. The icons are 16px Lucide muted — same treatment as sidebar nav icons, so visually consistent with the rest of the app.

## Definition of done

- The screen at `/onboard` (no template param, fresh user) renders the redesigned layout.
- All copy in this plan ships verbatim.
- Pressing `1` and `2` routes to the correct templates.
- Lighthouse-equivalent: no new layout shift, no new bundle weight beyond the tiny client-side keyboard handler (~25 lines, no deps).
- `npm run build` passes. No TS errors.
- Manual check: light mode, dark mode, mobile (375px), reduced-motion.
