# Front-End Audit — Recent Commits (through `30dc70f`)

Audit window: commits `0ff6e29` through `30dc70f`. Diagnostic only — no files were edited.

## Executive Summary

- The narrative panel was rebuilt the right way: `icp-narrative-panel.tsx` now uses the canonical `parseIcpNarrativeMarkdown` parser and the shared `EditableProseSection` primitive instead of its own copy of the splitter and bullet renderer.
- A new, symmetric `formatIcpNarrativeAsMarkdown` ↔ `parseIcpNarrativeMarkdown` round-trip lives in `src/lib/onboarding/templates/icp-definition/narrative-formatter.ts` with explicit tests (`narrative-formatter.test.ts`). This is the textbook way to handle the markdown ↔ structured-schema boundary.
- `30dc70f` widened the dashboard and added a sticky header but **introduced three more shadcn tokens** (`bg-muted`, `bg-background text-foreground`, `text-muted-foreground`) into a file that was previously leaning toward the CSS-var vocabulary. The token-vocabulary drift in `icp-dashboard-client.tsx` got worse, not better.
- The biggest single open issue is the parallel design-token vocabularies (shadcn semantic vs app `--color-*`). They resolve to identical OKLch values per `globals.css`, so this is drift, not a bug — but it splits the codebase in half for grep/refactor purposes.

## What's Good

- `10ff527` actually shrunk `account-card.tsx` (was grandfathered at 523 lines in `scripts/agent-check.baseline.json`; now 450). `account-card-draft-section.tsx` (26 lines) and `account-card-helpers.ts` (88 lines) are tight, single-purpose extractions.
- `messaging-hub-helpers.ts` cleanly separates pure markdown logic from JSX, with a dedicated unit test (`scripts/test-messaging-hub-helpers.ts`) — this is the right pattern.
- `messaging-empty-state.tsx` (84 lines) is a textbook empty-state component: three branches, a local `EmptyCard` helper, no abstraction overhead.
- `generate-icp-narrative-button.tsx` (42 lines) is single-purpose, well-named, and reused by both `icp-narrative-panel.tsx` and `messaging-hub.tsx`.
- `messaging/draft/page.tsx` is a thin RSC that defers everything to the client `DraftForm` — exactly the App Router pattern the rest of the project uses.
- The `IcpNarrativeReader` reuses the shared `StreamingDocumentReader` primitive instead of inventing a new streaming UI.
- `parseNarrativeBlocks` was retired — `parseIcpNarrativeMarkdown` (the typed parser in `narrative-formatter.ts`) is now the single source of truth for the narrative arc.
- `NarrativeBody` was retired — bullet rendering goes through `EditableProseSection`'s `ul.list-disc`. The `bg-foreground/30` pellet now exists in only one place (`messaging-hub.tsx`'s `MarkdownLine`).
- The narrative is editable in place via the new `updateIcpNarrativeArcAction` server action; `revalidatePath("/icp")` and `revalidatePath("/messaging")` keep the two consumers in sync.
- Round-trip integrity is tested. `narrative-formatter.test.ts` includes a `parse(format(arc)) === arc` round-trip and a "legacy prose without headings" case.
- `key={narrativeArc ?? "empty-narrative"}` on `<IcpNarrativePanel>` (`icp-dashboard-client.tsx:97`) correctly force-remounts the panel when the saved arc changes, so the local `useState(() => parseIcpNarrativeMarkdown(...))` re-initializes. Subtle but correct.

## What Needs Improving

| Priority | Area              | File(s)                                                                                                               | Finding                                                                                                                                                                                                                                                                                                                                                      | Why it matters                                                                                                                                                           |
| -------- | ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Modularity        | `src/app/(app)/messaging/_components/messaging-hub.tsx` (345 lines)                                                   | 7 components in one file: `MessagingHub`, `DocumentPanel`, `DocBlock`, `MarkdownLines`, `MarkdownLine`, `HooksSection`, `HookCard`, `RefreshPlaceholder`.                                                                                                                                                                                                    | Approaching the 400-line ceiling. Markdown render is a separate concern from layout/data-fetch.                                                                          |
| P1       | Design System     | `icp-dashboard-client.tsx:71`, `:118`, `:119` and `messaging-hub.tsx`                                                 | `30dc70f` added `bg-muted` (tab pill bg), `bg-background text-foreground` (active tab), `text-muted-foreground hover:text-foreground` (inactive tab). The file already contained `border-[var(--color-border)]`, `bg-[var(--color-bg)]/95`, `text-[var(--color-text-muted)]`. `messaging-hub.tsx` mixes both vocabularies internally (line 186 vs line 193). | Two design-token vocabularies side-by-side in the same component. Splits the codebase in half for grep/refactor.                                                         |
| P2       | Design System     | `account-card.tsx:405`, `account-card-draft-section.tsx:12`, `opportunity-card.tsx:320`, `sidebar-nav.tsx:196`/`:270` | `border-[var(--border)]` (raw shadcn) and `border-[var(--color-border)]` (the `@theme inline` mapping) used interchangeably. `sidebar-nav.tsx` mixes them within one file.                                                                                                                                                                                   | Same drift as the muted/foreground split, but lower volume.                                                                                                              |
| P2       | Navigability      | 49 imports across `src/app/**` and `src/components/**`                                                                | Phosphor icons aliased to old Lucide names: `Spinner as Loader2`, `MagnifyingGlass as Search`, `CaretDown as ChevronDown`, `Buildings as Building2`, etc.                                                                                                                                                                                                    | Pragmatic shortcut from `251abe4`, but `grep "Spinner"` won't find loading-state JSX (renders as `<Loader2>`). Either commit to the rename or document why aliases stay. |
| P3       | Component Quality | `icp-dashboard-client.tsx:97`                                                                                         | `key={narrativeArc ?? "empty-narrative"}` is doing important work — force-remounting the panel so the local `useState(() => parseIcpNarrativeMarkdown(...))` re-runs. Without it, switching tabs after generation won't reflect the new arc.                                                                                                                 | A future reader could "clean up" the key without realizing it. One line of comment fixes this.                                                                           |
| P3       | Component Quality | `icp-dashboard-client.tsx:33-49` and `icp-narrative-panel.tsx:22-34`                                                  | Both panels now follow the same shape: `useState(initialFromProp)` + `useTransition` + `persist(next)` server-action wrapper with toast on error.                                                                                                                                                                                                            | Two occurrences is below the rule for extraction. Watch-list candidate for a `usePersistedDocument` hook if a third appears.                                             |
| P3       | Navigability      | `sidebar-nav.tsx:45` ("ICP System Prompt"), route `/icp`, page heading "Your ICP" (`icp-dashboard-client.tsx:55`)     | Three different labels for the same destination.                                                                                                                                                                                                                                                                                                             | Mild — the route is unambiguous. Worth aligning on one label when convenient.                                                                                            |

## Recommended Improvements

### P1 — Pick one design-token vocabulary

The newly-added sticky header in `icp-dashboard-client.tsx` is the clearest example of why a decision is overdue. Within ~70 lines, the file uses:

- `border-[var(--color-border)]` (line 53) — app token
- `bg-[var(--color-bg)]/95` (line 53) — app token
- `text-[var(--color-text-muted)]` (line 57) — app token
- `border-[var(--color-border-strong)]` (line 102) — app token
- `bg-muted` (line 71) — shadcn token
- `bg-background text-foreground` (line 118) — shadcn tokens
- `text-muted-foreground hover:text-foreground` (line 119) — shadcn tokens

- **Proposed change:** Pick the app `--color-*` tokens as canonical (consistent with `account-card.tsx`, `opportunity-card.tsx`, `sidebar-nav.tsx`, `contact-panel.tsx`, and the new `icp-narrative-panel.tsx`). Sweep the tab pill in `icp-dashboard-client.tsx` and the `messaging-hub.tsx` inline functions. Add one line to `DESIGN.md` to declare which vocabulary is canonical.
- **Expected outcome:** New contributors don't have to guess which vocabulary to use. Theme work has one grep target.

### P1 — Split `messaging-hub.tsx`

- **Finding:** 7 components in one 345-line file; markdown render concerns mixed with section layout.
- **Proposed change:** Move `MarkdownLines`, `MarkdownLine`, `DocBlock`, and `DocumentPanel` into `messaging-hub-document-panel.tsx`. Move `HooksSection`, `HookCard`, `RefreshPlaceholder` into `messaging-hub-hooks.tsx`. `messaging-hub.tsx` keeps only the top-level composition and the `MessagingHub` props.
- **Expected outcome:** Three files of ~80–130 lines; data shape stays in one place.
- **Bonus opportunity:** Now that the narrative parser is canonical, `DocumentPanel` rendering `icp_narrative_arc` could detect that key and route through `parseIcpNarrativeMarkdown` to render typed sections, instead of the generic H2 splitter. This is a feature decision, not a cleanup — leave as-is unless the messaging hub starts needing the typed shape.

### P2 — Border token cleanup

- **Finding:** `border-[var(--border)]` and `border-[var(--color-border)]` both used; `sidebar-nav.tsx` mixes them at lines 196 and 270.
- **Proposed change:** Same as the P1 token sweep — standardize on `--color-border` (and `--color-border-strong` where applicable, e.g. `icp-dashboard-client.tsx:97`).
- **Expected outcome:** One border token across the app.

### P2 — Phosphor alias documentation or removal

- **Finding:** 49 `Phosphor as LucideName` aliases. Grep navigation by Phosphor name (e.g. `Spinner`) misses JSX usages.
- **Proposed change:** Two viable options — pick one based on appetite. **(a)** Document the aliases in `docs/agent-reference.md` as an intentional migration shim. **(b)** Sweep the JSX to use Phosphor names directly (`<Spinner>` instead of `<Loader2>`, `<MagnifyingGlass>` instead of `<Search>`). The JSX rename is purely textual and can be a single commit per file.
- **Expected outcome:** Either option resolves the navigability tax; no action means the aliases ossify into permanent dialect.

### P3

- **Annotate the `key` trick** on `<IcpNarrativePanel>` (`icp-dashboard-client.tsx:97`). One line of comment so a future reader doesn't "clean it up."
- **Watch for a third "persisted document" panel.** If one appears, extract a `usePersistedDocument(initial, action)` hook covering the `useState(initial) + useTransition + persist(next) + toast.error` pattern shared by `icp-dashboard-client.tsx:33-49` and `icp-narrative-panel.tsx:22-34`.
- **Align the GTM ICP nav label, route, and page heading** on a single name. "Your ICP" reads best in the page; the sidebar can match.

## Open Questions

- Is the new sticky header in `30dc70f` an early signal that other dashboard pages will adopt the pattern? If yes, this is a good moment to extract `<StickyPageHeader>` so the `bg-[var(--color-bg)]/95 backdrop-blur` choice lives in one file. If no, leave it inline.
- The token-vocabulary call is yours to make. The audit can recommend "pick one," but the choice between shadcn semantics (more portable to other shadcn projects) and the app `--color-*` tokens (already dominant here) is a project preference, not a correctness issue.
- Is the `text-muted-foreground` style in the remaining messaging files an intentional adoption of shadcn tokens, or just the path of least resistance because shadcn primitives use them? If intentional, the recommendation flips: sweep the older code instead.
