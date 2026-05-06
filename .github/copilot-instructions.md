## Design Context

### Users

Single operator: a GTM engineer or job seeker running a personal outreach pipeline. They use this app to analyze job descriptions, draft outreach emails, research companies/people, run coaching sessions, and maintain a decision trail. Context is always focused, task-oriented work — paste data in, get structured intelligence out. Speed and clarity matter more than discovery or exploration.

### Brand Personality

**Calm, precise, confident.** Like a well-organized analyst's desk — quiet authority, no flash. The interface should feel like a trusted instrument, not a product trying to impress. Every element earns its place.

### Aesthetic Direction

- **Primary reference:** Linear — clean data density, keyboard-first, subtle animations, monochrome + accent
- **Visual tone:** Restrained, warm-neutral, typographically precise
- **Anti-references:** Overly playful SaaS dashboards, gradient-heavy marketing tools, anything with rounded cartoon illustrations or excessive color
- **Theme:** Light + dark mode (warm neutrals in light, true dark in dark mode)
- **Palette:** Warm beige/off-white base (`#f7f7f5`), blue accent (`#1e63ff`), semantic greens/oranges/reds for status. Dark mode: near-black backgrounds, same accent and semantic colors adjusted for dark surfaces
- **Typography:** System font stack (SF Pro Text), tight hierarchy — `text-xl` page titles, `text-sm` body, `text-xs` metadata
- **Icons:** Lucide React, 14-16px standard sizes, muted color unless interactive

### Design Principles

1. **Data density over decoration** — Show more information in less space. No decorative elements, no unnecessary whitespace padding. Every pixel serves comprehension.

2. **Status at a glance** — Verdicts, scores, and states should be immediately scannable via color-coded badges, position, and typographic weight. A user glancing at a list should know what needs attention without reading.

3. **Keyboard-first, mouse-friendly** — Command palette (Cmd+K) is the primary navigation. All interactive elements must have visible focus states. Animations should be subtle (120ms transitions, not 300ms bounces).

4. **Consistency is kindness** — Same spacing, same border-radius, same badge patterns everywhere. When the user learns one pattern, it should transfer to every other view. Extract and reuse, never duplicate.

5. **Quiet confidence** — The UI should feel like it knows what it's doing. No loading spinners without context. No empty states without guidance. No errors without actionable next steps. Calm, never anxious.

### Technical Constraints

- Next.js 16 + React 19 + Tailwind CSS v4 (CSS-based config)
- shadcn/ui component library (being initialized)
- Supabase backend
- Vercel deployment
- System fonts only (no custom font loading)
- Light + dark mode via CSS variables
