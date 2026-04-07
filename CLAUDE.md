# CLAUDE.md — GTM Command Center

## What This Is

Omar's browser-based operating system for job search — analysis, outreach, research, coaching, memory, and trail. Single-user tool, not a product for others.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Styling**: Tailwind CSS v4 (CSS-based config, no tailwind.config.ts) + shadcn/ui
- **Database**: Supabase (Postgres + Auth)
- **Deployment**: Vercel
- **Font**: Geist (via next/font/google)
- **Icons**: Lucide React (14-16px standard sizes)

## Architecture

```
src/
├── app/
│   ├── layout.tsx          # Root layout — ThemeProvider, TooltipProvider, Toaster
│   ├── globals.css         # All design tokens, component classes, light/dark theme
│   └── (app)/
│       ├── layout.tsx      # Auth gate → AppShell wrapper
│       ├── analysis/       # JD rubrics, company fit, full analysis
│       ├── outreach/       # Cold email drafts (CEO voice, growth leader frame)
│       ├── research/       # Exa-backed people/company research
│       ├── coaching/       # Session transcript → structured summary
│       ├── memory/         # Imported .claude/ memory docs, editable in-browser
│       ├── trail/          # Career journal from coaching sessions
│       └── workspace-tools/# Prompt creator, skill creator
├── components/
│   ├── app-shell.tsx       # Client wrapper — manages sidebar state
│   ├── sidebar-nav.tsx     # Responsive: desktop aside + mobile Sheet
│   ├── top-bar.tsx         # Title + hamburger (mobile) + ⌘K button
│   ├── command-palette.tsx # cmdk-based, ⌘K toggle
│   ├── page-header.tsx     # Shared: title + description + action buttons
│   ├── list-item.tsx       # Shared: clickable row with title/subtitle/meta
│   ├── empty-state.tsx     # Shared: centered message + CTA
│   ├── detail-header.tsx   # Shared: back arrow + title + subtitle + actions
│   ├── status-banner.tsx   # Shared: running spinner or failed error
│   └── ui/                 # shadcn/ui components (owned source code)
│       ├── button.tsx, badge.tsx, card.tsx, input.tsx, textarea.tsx
│       ├── label.tsx, separator.tsx, skeleton.tsx
│       ├── sheet.tsx, dialog.tsx, tooltip.tsx, sonner.tsx
└── lib/
    ├── utils.ts            # cn(), formatRelativeTime(), assertEnv()
    ├── supabase/           # Server client, types, auth helpers
    └── jobs/               # useJobPoll hook for async background jobs
```

## Design System

### Token Architecture

All color tokens live in `:root` (light) and `.dark` (dark) blocks in `globals.css`. They respond to the theme automatically.

**App tokens** (used via `var()` in inline styles):

- `--color-text`, `--color-text-muted`, `--color-text-subtle` — text hierarchy
- `--color-surface`, `--color-surface-muted` — card backgrounds
- `--color-blue`, `--color-blue-muted` — brand accent (focus rings, spinners, accents)
- `--color-success`, `--color-warning`, `--color-danger` — semantic status
- `--color-border-strong` — heavier borders

**shadcn tokens** (used via Tailwind classes like `bg-card`, `text-muted-foreground`):

- `--background`, `--foreground`, `--card`, `--muted`, `--primary`, `--border`, etc.

Both sets map to the same palette and both respond to `.dark` class.

### Component Classes (globals.css)

- `.surface` — white card with border + large radius
- `.surface-muted` — muted bg card with border + medium radius
- `.btn-primary` — dark bg button with hover/active/disabled states
- `.btn-ghost` — transparent button with hover bg
- `.input` — form input with blue focus ring
- `.badge` + `.badge-success/warning/danger/accent` — status pills (dark mode variants included)

### Naming Collision Note

shadcn's `--color-accent` (hover background) conflicts with our original blue accent. Our blue is `--color-blue` / `--color-blue-muted`. Never use `--color-accent` for the blue — that's shadcn's hover state token.

## Design Principles (from .impeccable.md)

1. **Data density over decoration** — every pixel serves comprehension
2. **Status at a glance** — scannable badges, scores, states
3. **Keyboard-first, mouse-friendly** — ⌘K nav, focus-visible rings, 120ms transitions
4. **Consistency is kindness** — use shared components, never duplicate patterns
5. **Quiet confidence** — no spinners without context, no empty states without guidance

Reference: Linear. Personality: calm, precise, confident.

## Shared Components — When to Use What

| Component      | Use for                                                             |
| -------------- | ------------------------------------------------------------------- |
| `PageHeader`   | Every list page (title + description + action buttons)              |
| `ListItem`     | Clickable rows in list pages (analysis, outreach, research, memory) |
| `EmptyState`   | When a list has zero items (message + hint + CTA)                   |
| `DetailHeader` | Every detail/edit page (back arrow + title + subtitle + actions)    |
| `StatusBanner` | Running or failed state on detail pages                             |

## Providers (root layout)

- `ThemeProvider` (next-themes) — `defaultTheme="light"`, `attribute="class"`
- `TooltipProvider` (shadcn) — wraps all content
- `Toaster` (sonner) — positioned bottom-right, themed via shadcn tokens

## Key Patterns

### Background Jobs

Analysis and research use async background jobs. The pattern:

1. Server action enqueues a job → returns `jobId`
2. Client polls via `useJobPoll(jobId)` hook
3. On completion, `router.refresh()` to re-fetch server data
4. `StatusBanner` shows running/failed state

### Toast Notifications

Import `toast` from `"sonner"`. Used in draft-editor and memory-editor for save/copy feedback.

### Responsive Sidebar

- Desktop (md+): fixed `w-60` aside
- Mobile (<md): hidden, triggered via hamburger in TopBar, rendered in `Sheet` (side="left")
- State managed in `AppShell` (client component), layout.tsx is a thin server wrapper

## Scripts

```bash
npm run dev              # Start dev server
npm run build            # Production build
npm run import:memory    # Seed memory docs from .claude/ files
npm run import:evaluations
npm run import:research
npm run import:outreach
npm run import:coaching
npm run seed             # Run all imports
```
