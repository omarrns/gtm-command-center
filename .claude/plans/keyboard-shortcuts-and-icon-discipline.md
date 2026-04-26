# Keyboard Shortcuts as a Primitive + Icon Discipline

## Goal

Two related upgrades to our design system, one with code, one with documentation:

1. **App-wide `⌘\` theme toggle.** Wire a global keyboard shortcut so the user can flip light/dark from any screen. Document it as a canonical primitive.
2. **Tighten `DESIGN.md` so icons are default-deny.** Today's rule is permissive — icons keep showing up where they shouldn't. Make the prohibition explicit, with a short list of allowed exceptions.

Both changes ship together because the keyboard shortcut also belongs in `DESIGN.md` as a documented primitive — they're the same edit cycle.

## Part A — `⌘\` theme toggle (app-wide)

### Why `⌘\`

- **No browser collision.** `⌘D` = bookmark, `⌘T` / `⌘W` / `⌘N` = tab management, `⌘R` = reload, `⌘L` = address bar, `⌘P` = print, `⌘S` = save. `⌘\` is one of the few unclaimed single-modifier chords on macOS.
- **No collision in this app.** `⌘K` = palette, `⌘B` = sidebar. `⌘\` sits next to `⌘B` on the keyboard — adjacent global toggles read as a system.
- **Linear uses it.** Direct precedent in our reference product.
- **Single keypress, no chord.** Faster than `⌘ Shift T`-style alternatives.

On Windows / Linux: `Ctrl+\` does the same thing.

### Implementation

- Lift `useTheme` into `AppShell` (currently only the `ChromelessThemeToggle` sub-component calls it).
- Add a `useEffect` in `AppShell` that listens for `keydown`, fires `setTheme(theme === "dark" ? "light" : "dark")` on `event.code === "Backslash"` with `event.metaKey || event.ctrlKey`.
- Reuse the existing form-input guard from the `⌘B` handler (skip on `INPUT` / `TEXTAREA` / `isContentEditable`).
- The handler installs once at the AppShell level, so it works on **every** page — chromeless `/onboard` included.
- Add a discoverability hint: append `· ⌘\` to the existing `aria-label` on the theme button, and add `title="Toggle theme · ⌘\"` so a hover surfaces the shortcut.
- The TopBar button and the chromeless corner button keep working as visual affordances. No behavior change to either.

### Files

- `src/components/app-shell.tsx` — install global handler, lift `useTheme`.
- `src/components/top-bar.tsx` — add the `title` attribute for hover discoverability.
- No new files. No new dependencies.

### Verification

1. Press `⌘\` on `/today` (chromed) — theme flips, persists across reload (next-themes already handles persistence).
2. Press `⌘\` on `/onboard` (chromeless) — same behavior.
3. Click into a textarea, press `⌘\` — does **not** fire (input guard).
4. Hover the topbar theme button — tooltip surfaces `⌘\`.
5. Run `npx tsc --noEmit` clean.

## Part B — `DESIGN.md` updates

Two edits to `DESIGN.md`. Drafted verbatim below — the implementation phase just pastes them in.

### B1 — New section: Keyboard Shortcuts

Insert a new subsection under the existing "Design Principles" block, between principle 3 ("Keyboard-first, mouse-friendly") and principle 4 ("Consistency is kindness"). Or — cleaner — add it as a new top-level subsection under the "Typography Rules" / "Motion Rules" siblings, named "Keyboard Shortcut Rules."

```
### Keyboard Shortcut Rules

Keyboard shortcuts are first-class design primitives, not bonus features. The keyboard-first principle is hollow without them. Treat new shortcuts the way you treat new colors — there should be very few, every one should be intentional, and they should be documented in one place.

**Canonical shortcuts:**

| Shortcut    | Action                          | Scope         |
| ----------- | ------------------------------- | ------------- |
| ⌘K          | Open command palette            | App-wide      |
| ⌘B          | Toggle sidebar                  | App-wide      |
| ⌘\          | Toggle theme                    | App-wide      |
| ⌘Enter      | Submit / confirm primary action | Per form      |
| Esc         | Close, dismiss, cancel          | Per surface   |
| 1 / 2 / 3   | Numbered choices on a screen    | Per screen    |

**Rules for adding a shortcut:**

1. Avoid browser-reserved chords: ⌘D, ⌘T, ⌘W, ⌘N, ⌘L, ⌘R, ⌘P, ⌘S, ⌘F, ⌘Shift+T.
2. Prefer single-key shortcuts (1/2/3, Esc) for screen-local choices. Reserve modifier+key for global shortcuts.
3. Every shortcut must have a discoverable hint: `<kbd>` in a tooltip, palette listing, or on-screen hint row.
4. Every handler must guard against firing while focus is in an input, textarea, or contenteditable element.
5. Update this table when adding or changing a shortcut. If a shortcut is not in this table, it does not exist.
```

### B2 — Tighten icon rule

**Replace** the current `Icons:` line in the "Aesthetic Direction" subsection:

> Icons: Lucide React, 14-16px standard sizes, muted color unless interactive

with:

> Icons: Lucide React, 14-16px when used. Default-deny — see Icon Usage.

**Add** a new top-level subsection after "Color Usage Principles":

```
### Icon Usage

**Default: no icon.** This is the single most common drift away from our design language. Icons next to titles, in cards, on buttons that already say what they do — these moves make the product feel like a SaaS template, not a Linear-grade instrument. Resist them.

**Allowed only in these specific surfaces:**

- **Navigation chrome.** Sidebar nav items, tab bars, command palette entries — icons help the user learn the navigation map and scan it without reading.
- **Icon-only buttons** where text would not fit and the action is conventional (theme toggle, sidebar collapse, menu, close, copy-to-clipboard).
- **Status indicators with motion.** Loading spinners (`Loader2`), sync states, error/success badges — the icon carries information faster than text.

**Never** add an icon next to:

- A card title or section heading
- A list item's primary text
- A form field label
- An empty-state message (the copy does the work)
- A button that already has a clear text label
- A persona / mode chooser (the title and a mono index are enough)

**The test before adding an icon:** "Is this icon teaching the user the navigation map, encoding system state, or replacing a missing label?" If none of those, the typography hierarchy is doing too little work. Fix the typography instead of decorating with an icon.
```

### Files

- `DESIGN.md` — two edits, drafted above.

## Step plan

1. **Phase 1 — DESIGN.md.** Apply both DESIGN.md edits first so the rule is in place before the code lands. → verify: file reads in order, table renders correctly in markdown preview.
2. **Phase 2 — `⌘\` handler.** Edit `app-shell.tsx`: lift `useTheme`, add the keyboard `useEffect` next to the existing `⌘B` handler. → verify: `⌘\` flips theme on any page, input-focused press is a no-op.
3. **Phase 3 — Discoverability.** Edit `top-bar.tsx`: add `title="Toggle theme · ⌘\"` to the theme toggle button. → verify: hover surfaces the shortcut.
4. **Phase 4 — Typecheck + browser.** Run `npx tsc --noEmit`, then test `⌘\` on `/today`, `/onboard`, and inside a textarea on `/settings`.

## Out of scope (explicit)

- **No tooltip refactor across the app.** Just the theme toggle button gets the new `title` attribute. Other shortcuts remain discoverable via the command palette or existing surfaces.
- **No retroactive icon removal.** The new icon rule applies to net-new and changed code. Existing decorative icons in the app are tech debt — fix as encountered, not in this PR.
- **No screen-reader-specific announcement** when theme flips beyond the existing `aria-label`. The visual change is the announcement.
- **No new shortcuts beyond `⌘\`.** Adding `1/2/3` for the persona picker already shipped. Future shortcuts are separate decisions.
- **No animation on the theme transition itself** (e.g., a 200ms color crossfade across all surfaces). DESIGN.md says "respect reduced motion every time" — instant flip is correct.

## Risks and mitigations

- **`⌘\` collides with a browser extension** the user has installed (some VPN / clipboard managers bind it). **Mitigation:** if the user reports it, re-evaluate. Browser-default chords are the only collision class we can preempt; extensions are user-specific.
- **The icon rule is too strict and breaks an existing legitimate use** (e.g., `Loader2` inside a button that also has text). **Mitigation:** the "Status indicators with motion" exception covers spinners explicitly. Real ambiguity → revisit the rule, but err on the side of dropping the icon.
- **The DESIGN.md table drifts from reality** as new shortcuts are added without updating it. **Mitigation:** rule 5 of "Rules for adding a shortcut" makes the table the source of truth — "if it's not in this table, it does not exist." Future PRs that introduce shortcuts must update the table.

## Definition of done

- `DESIGN.md` contains both new sections, drafted as in this plan.
- `⌘\` flips theme app-wide. Verified on a chromed page, the chromeless `/onboard`, and is correctly suppressed inside form inputs.
- Hover on the topbar theme button surfaces `⌘\`.
- `npx tsc --noEmit` passes.
- One commit, focused: "feat(design): ⌘\\ theme toggle + tighten icon rule".
