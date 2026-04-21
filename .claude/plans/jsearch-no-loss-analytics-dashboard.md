# Plan: No-Loss JSearch Pipeline + Analytics Dashboard

## Context

The JSearch API returns 17 fields per job. The pipeline currently stores 7 and discards the rest
(city, state, remote flag, employment type, salary range, required skills). The user wants to
stop losing that data and have an analytics page to spot trends over time. No separate admin
login is needed — the existing Supabase auth already gates the `(app)` layout.

**Reviewed by Codex** — 11 issues identified and incorporated below.

---

## Forward-only capture

Old `opportunities` rows will have `null` for all new fields — that is expected and acceptable.
The 30-day dedup window in `createOpportunity` means a re-discovered job (same company+title)
within 30 days will be skipped entirely, so its richer metadata will not be backfilled. This is
a known trade-off: capture is forward-only from the migration date. The analytics dashboard
shows null coverage explicitly in the salary chart so the gap is visible.

---

## Part A — Capture Missing JSearch Fields

### Phase A1 — DB migration

**Create:** `supabase/migrations/<cli-generated-stamp>_jsearch_extra_fields.sql`

Generate via `supabase migration new jsearch_extra_fields` — let the CLI assign the timestamp.
Do not hand-write the filename: `20260421000001` is taken by `_agentic_onboarding.sql` and
any other hard-coded stamp risks a future collision.

All columns nullable — safe to add without touching existing rows or pipeline code.
Salary stored as `numeric` (not `integer`) because JSearch can return decimals and period
normalization happens in TypeScript, not the DB.

```sql
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS job_city            text,
  ADD COLUMN IF NOT EXISTS job_state           text,
  ADD COLUMN IF NOT EXISTS job_is_remote       boolean,
  ADD COLUMN IF NOT EXISTS job_employment_type text,
  ADD COLUMN IF NOT EXISTS job_min_salary      numeric,
  ADD COLUMN IF NOT EXISTS job_max_salary      numeric,
  ADD COLUMN IF NOT EXISTS job_salary_currency text,
  ADD COLUMN IF NOT EXISTS job_salary_period   text,
  ADD COLUMN IF NOT EXISTS job_required_skills text[];
```

No new indexes — the existing `(user_id, discovered_at)` and `(user_id, stage)` indexes on
`opportunities` cover the analytics query pattern. Add indexes only when a real filter/sort
bottleneck appears.

Skip `job_country` (always "us") and `job_highlights` (redundant with `job_description`).

---

### Phase A2 — Add Zod validation to jsearch.ts

**Modify:** `src/lib/pipeline/jsearch.ts`

Add a Zod schema mirroring `JSearchResult`. Replace the unsafe cast with per-element
`safeParse` so one malformed record does not kill the batch. Drop the hand-written
`JSearchResult` interface and derive the type via `z.infer`.

Key schema notes:

- `job_is_remote`: `z.boolean().nullable().default(null)` — missing remote data stays null,
  not false. Defaulting to false would corrupt the "Unknown" bucket in the analytics dashboard.
- `job_required_skills`: `z.array(z.string()).nullable().default(null)`
- `job_min_salary` / `job_max_salary`: `z.number().nullable().default(null)` — matches
  `numeric` DB column; covers both integer and decimal values from JSearch.
- `job_highlights`: parse but never store — prevents cast error without persisting redundant data.

```ts
// Replace:
return (body.data as JSearchResult[]) ?? [];

// With:
return (body.data ?? []).flatMap((raw: unknown) => {
  const r = JSearchResultSchema.safeParse(raw);
  if (!r.success) {
    console.warn("[jsearch] Skipping malformed record:", r.error.issues[0]);
    return [];
  }
  return [r.data];
});
```

---

### Phase A3 — Extend CreateOpportunityInput

**Modify:** `src/lib/pipeline/opportunities.ts` (lines 17–25)

Add 9 optional fields. The `createOpportunity` function body needs **no change** — the
`{ user_id: userId, ...input }` spread already forwards all input fields to the upsert.

```ts
interface CreateOpportunityInput {
  source: OpportunitySource;
  external_id: string;
  company_name: string;
  role_title: string;
  job_url?: string;
  job_description?: string;
  job_posted_at?: string;
  // new — all optional, all nullable
  job_city?: string | null;
  job_state?: string | null;
  job_is_remote?: boolean | null;
  job_employment_type?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
  job_salary_period?: string | null;
  job_required_skills?: string[] | null;
}
```

---

### Phase A4 — Pass new fields in discover.ts AND activation.ts

**Two files must be updated** — the pipeline has two JSearch ingestion paths:

1. `src/lib/pipeline/steps/discover.ts` — the scheduled cron pipeline
2. `src/lib/pipeline/activation.ts` — the first-run activation search (line ~107)

Both call `createOpportunity` with the current 7-field shape. Both need the same 9-field
addition. Missing either one means activation runs still discard the new fields.

```ts
// Same block for both discover.ts and activation.ts:
const created = await createOpportunity(svc, userId, {
  source: "jsearch",
  external_id: job.job_id,
  company_name: job.employer_name,
  role_title: job.job_title,
  job_url: job.job_apply_link,
  job_description: job.job_description ?? undefined,
  job_posted_at: job.job_posted_at_datetime_utc ?? undefined,
  // new fields
  job_city: job.job_city ?? null,
  job_state: job.job_state ?? null,
  job_is_remote: job.job_is_remote ?? null,
  job_employment_type: job.job_employment_type ?? null,
  job_min_salary: job.job_min_salary ?? null,
  job_max_salary: job.job_max_salary ?? null,
  job_salary_currency: job.job_salary_currency ?? null,
  job_salary_period: job.job_salary_period ?? null,
  job_required_skills: job.job_required_skills ?? null,
});
```

---

### Phase A5 — Extend OpportunityRow in types.ts

**Modify:** `src/lib/supabase/types.ts` — insert after `job_posted_at: string | null;`

```ts
  job_city: string | null;
  job_state: string | null;
  job_is_remote: boolean | null;
  job_employment_type: string | null;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_currency: string | null;
  job_salary_period: string | null;
  job_required_skills: string[] | null;
```

Note: `types.ts` is also modified by SPEC-2 (adds fields to `OnboardingInterviewRow` and a
new `OnboardingArtifactRow`). These are different types — no logic conflict, but if the two
branches are open simultaneously, expect a merge conflict here that resolves in seconds.

---

## Part B — Analytics Dashboard

### Phase B1 — Install shadcn chart

```bash
npx shadcn@latest add chart
```

Creates `src/components/ui/chart.tsx` and installs `recharts`. All chart components must be
`"use client"` — recharts is client-only.

---

### Phase B2 — Data loader (single query)

**Create:** `src/app/(app)/analytics/_loaders/analytics-data.ts`

One query fetches all columns needed for every chart. Seven round trips for a
single-user analytics page is unnecessary overhead. TypeScript groups the results in
memory — add SQL aggregation only if row volume becomes a real bottleneck.

```ts
export async function loadAnalyticsData(svc: SupabaseClient, userId: string) {
  const { data, error } = await svc
    .from("opportunities")
    .select(
      `
      discovered_at,
      stage,
      score,
      job_is_remote,
      company_name,
      role_title,
      job_min_salary,
      job_max_salary,
      job_salary_currency,
      job_salary_period,
      job_required_skills
    `,
    )
    .eq("user_id", userId)
    .order("discovered_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
```

Return the raw rows. All bucketing, grouping, and top-N logic happens in the dashboard
client so it stays in one place and is easy to adjust without touching the loader.

**Salary normalization note:** the salary chart should only include rows where
`job_salary_period = 'YEAR'` and `job_salary_currency = 'USD'` (or your target currency).
Mixing hourly and annual values in the same buckets produces meaningless data. Show a
"salary data available for X of Y roles" coverage note so null/excluded coverage is visible.

---

### Phase B3 — Analytics page

**Create:** `src/app/(app)/analytics/page.tsx`

Route is `/analytics`, not `/admin` — the page is a personal analytics view, not an admin
surface. If a true admin area is needed later, create it separately.

Uses the service client with an explicit `user_id` filter — this matches the existing pattern
across `src/app/(app)/page.tsx` and other app pages, and works correctly with the dev fake
user returned by `requireUser()` in development (RLS does not recognize the fake user, but
service client + `.eq("user_id", userId)` does).

```ts
export default async function AnalyticsPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const rows = await loadAnalyticsData(svc, user.id);
  return (
    <>
      <PageHeader title="Analytics" description="Trends across all discovered opportunities" />
      <AnalyticsDashboardClient rows={rows} />
    </>
  );
}
```

---

### Phase B4 — Dashboard client (single component)

**Create:** `src/app/(app)/analytics/_components/analytics-dashboard-client.tsx`

One `"use client"` component. All chart sections live here as local functions or small
inline components — split into separate files only when the file exceeds the 400-line limit.

Charts for the first version (prioritized by signal value):

1. **Discovery over time** — `LineChart`, last 90 days, bucket by date
2. **Stage funnel** — `BarChart`, count per stage
3. **Score distribution** — `BarChart`, 5 buckets (0–20, 20–40, 40–60, 60–80, 80–100)
4. **Remote breakdown** — `PieChart` donut, Remote / In-Office / Unknown (null)
5. **Salary distribution** — `BarChart`, annual USD only + coverage note showing null%
6. **Top companies** — `BarChart` horizontal, top 10 by count
7. **Top required skills** — `BarChart` horizontal, top 10 by frequency across all rows

Layout: full-width for line + funnel; two-column for score + remote; full-width for salary,
companies, skills. Each section wrapped in a shadcn `Card`.

---

### Phase B5 — Sidebar nav

**Modify:** `src/components/sidebar-nav.tsx`

Add `BarChart2` icon and one `NAV` entry:

```ts
import { BarChart2 } from "lucide-react";

// Add to NAV array:
{ href: "/analytics", label: "Analytics", icon: BarChart2 },
```

---

## Files Changed

| Action | Path                                                                 |
| ------ | -------------------------------------------------------------------- |
| Create | `supabase/migrations/<new-stamp>_jsearch_extra_fields.sql`           |
| Modify | `src/lib/pipeline/jsearch.ts`                                        |
| Modify | `src/lib/pipeline/opportunities.ts`                                  |
| Modify | `src/lib/pipeline/steps/discover.ts`                                 |
| Modify | `src/lib/pipeline/activation.ts`                                     |
| Modify | `src/lib/supabase/types.ts`                                          |
| Modify | `src/components/sidebar-nav.tsx`                                     |
| Create | `src/app/(app)/analytics/page.tsx`                                   |
| Create | `src/app/(app)/analytics/_loaders/analytics-data.ts`                 |
| Create | `src/app/(app)/analytics/_components/analytics-dashboard-client.tsx` |
| CLI    | `src/components/ui/chart.tsx` (via `npx shadcn add chart`)           |

---

## Verification

1. `npx tsc --noEmit` — zero errors (all new fields optional/nullable)
2. Apply migration — confirm 9 new columns appear in Supabase Studio
3. Trigger one **cron pipeline run** — inspect inserted row in Studio, confirm new fields
   populate (or null if JSearch didn't provide them for that listing)
4. Trigger one **activation run** — inspect inserted rows, confirm same fields captured
   (validates the activation.ts path was updated correctly)
5. Navigate to `/analytics` — charts render without JS errors; empty/null states show
   gracefully with zero data
6. `npm run build` — clean build (recharts imports only inside `"use client"` files)
