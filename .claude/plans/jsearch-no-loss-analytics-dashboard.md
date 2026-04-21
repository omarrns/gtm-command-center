# Plan: No-Loss JSearch Pipeline + Analytics Dashboard

## Context

The JSearch API returns 17 fields per job. The pipeline currently stores 7 and discards the rest
(city, state, remote flag, employment type, salary range, required skills). The user wants to
stop losing that data and have an analytics page to spot trends over time. No separate admin
login is needed — the existing Supabase auth already gates the `(app)` layout.

---

## Part A — Capture Missing JSearch Fields

### Phase A1 — DB migration

**Create:** `supabase/migrations/20260421000001_jsearch_extra_fields.sql`

All columns nullable — safe to add without touching existing rows or pipeline code.

```sql
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS job_city            text,
  ADD COLUMN IF NOT EXISTS job_state           text,
  ADD COLUMN IF NOT EXISTS job_is_remote       boolean,
  ADD COLUMN IF NOT EXISTS job_employment_type text,
  ADD COLUMN IF NOT EXISTS job_min_salary      integer,
  ADD COLUMN IF NOT EXISTS job_max_salary      integer,
  ADD COLUMN IF NOT EXISTS job_salary_currency text,
  ADD COLUMN IF NOT EXISTS job_salary_period   text,
  ADD COLUMN IF NOT EXISTS job_required_skills text[];

CREATE INDEX IF NOT EXISTS idx_opportunities_remote
  ON public.opportunities (user_id, job_is_remote);

CREATE INDEX IF NOT EXISTS idx_opportunities_salary
  ON public.opportunities (user_id, job_min_salary, job_max_salary)
  WHERE job_min_salary IS NOT NULL;
```

Skip `job_country` (always "us") and `job_highlights` (redundant with `job_description`).

---

### Phase A2 — Add Zod validation to jsearch.ts

**Modify:** `src/lib/pipeline/jsearch.ts` (line 82 is the unsafe cast)

Add a Zod schema mirroring `JSearchResult`. Replace the cast with per-element `safeParse`
so one malformed record doesn't kill the batch. Drop the `JSearchResult` hand-written interface
and derive the type from the schema via `z.infer`.

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

Key schema notes:

- `job_is_remote`: `z.boolean().default(false)` — non-nullable in JSearch but we default-safe it
- `job_required_skills`: `z.array(z.string()).nullable().default(null)`
- `job_highlights`: `z.object({ Qualifications: z.array(z.string()).optional(), Responsibilities: z.array(z.string()).optional() }).nullable().default(null)` (never stored, just prevents cast error)

---

### Phase A3 — Extend CreateOpportunityInput

**Modify:** `src/lib/pipeline/opportunities.ts` (lines 17–25)

Add 9 optional fields. The `createOpportunity` function body needs **no change** — the
`{ user_id: userId, ...input }` spread at line 61 already forwards all input fields to the upsert.

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

### Phase A4 — Pass new fields in discover.ts

**Modify:** `src/lib/pipeline/steps/discover.ts` (lines 38–46)

Add 9 fields to the `createOpportunity` call:

```ts
const created = await createOpportunity(svc, userId, {
  source: "jsearch",
  external_id: job.job_id,
  company_name: job.employer_name,
  role_title: job.job_title,
  job_url: job.job_apply_link,
  job_description: job.job_description ?? undefined,
  job_posted_at: job.job_posted_at_datetime_utc ?? undefined,
  // new fields
  job_city: job.job_city,
  job_state: job.job_state,
  job_is_remote: job.job_is_remote,
  job_employment_type: job.job_employment_type,
  job_min_salary: job.job_min_salary,
  job_max_salary: job.job_max_salary,
  job_salary_currency: job.job_salary_currency,
  job_salary_period: job.job_salary_period,
  job_required_skills: job.job_required_skills,
});
```

---

### Phase A5 — Extend OpportunityRow in types.ts

**Modify:** `src/lib/supabase/types.ts` — insert after line 183 (`job_posted_at: string | null;`)

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

---

## Part B — Analytics Dashboard

### Phase B1 — Install shadcn chart

```bash
npx shadcn@latest add chart
```

Creates `src/components/ui/chart.tsx` and installs `recharts`. All chart components must be
`"use client"` — recharts is client-only.

---

### Phase B2 — Data loader

**Create:** `src/app/(app)/admin/_loaders/admin-analytics.ts`

One function per chart. All called via `Promise.all`. Uses the Supabase server client (RLS
already scopes to the user — no service client needed for reads).

| Function                 | Query                                      | Groups in                             |
| ------------------------ | ------------------------------------------ | ------------------------------------- |
| `loadDiscoveryOverTime`  | `select('discovered_at')`, last 90 days    | TS — bucket by date string, fill gaps |
| `loadStageFunnel`        | `select('stage')`                          | TS — group by stage                   |
| `loadScoreDistribution`  | `select('score').not('score', 'is', null)` | TS — 5 buckets                        |
| `loadRemoteBreakdown`    | `select('job_is_remote')`                  | TS — Remote / In-Office / Unknown     |
| `loadTopCompanies`       | `select('company_name')`                   | TS — top 10                           |
| `loadTopRoles`           | `select('role_title')`                     | TS — top 10                           |
| `loadSalaryDistribution` | `select('job_min_salary, job_max_salary')` | TS — 5 buckets + null%                |

Export a single `loadAdminAnalytics(client, userId)` that runs all 7 in `Promise.all` and returns
a typed `AdminAnalytics` object.

---

### Phase B3 — Admin page

**Create:** `src/app/(app)/admin/page.tsx`

Server component. The `(app)` layout already gates auth; page calls `requireUser()` only to
get `userId` for the query.

```ts
export default async function AdminPage() {
  const { id: userId } = await requireUser();
  const client = createSupabaseServerClient();
  const analytics = await loadAdminAnalytics(client, userId);
  return (
    <>
      <PageHeader title="Analytics" description="Trends across all discovered opportunities" />
      <AdminDashboardClient analytics={analytics} />
    </>
  );
}
```

---

### Phase B4 — Chart components

**Create:** `src/app/(app)/admin/_components/`

| File                         | Chart type                         | Data prop            |
| ---------------------------- | ---------------------------------- | -------------------- |
| `admin-dashboard-client.tsx` | Grid orchestrator (`"use client"`) | `AdminAnalytics`     |
| `discovery-chart.tsx`        | `LineChart`                        | `DiscoveryByDay[]`   |
| `stage-funnel-chart.tsx`     | `BarChart`                         | `StageFunnelEntry[]` |
| `score-dist-chart.tsx`       | `BarChart` (5 buckets)             | `ScoreBucket[]`      |
| `remote-chart.tsx`           | `PieChart` (donut)                 | `RemoteBreakdown[]`  |
| `top-companies-chart.tsx`    | `BarChart` horizontal              | `TopCompany[]`       |
| `top-roles-chart.tsx`        | `BarChart` horizontal              | `TopRole[]`          |
| `salary-chart.tsx`           | `BarChart` + null banner           | `SalaryBucket[]`     |

Layout: full-width for line + funnel charts; two-column grid for score hist + donut; full-width
for top companies/roles/salary. Each chart wrapped in a shadcn `Card`.

---

### Phase B5 — Sidebar nav

**Modify:** `src/components/sidebar-nav.tsx`

Add `BarChart2` to the import (line 5) and one entry to the `NAV` array (line 16–21):

```ts
import {
  CalendarCheck,
  Clock,
  Eye,
  Settings,
  LogOut,
  BarChart2,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Today", icon: CalendarCheck },
  { href: "/history", label: "History", icon: Clock },
  { href: "/watchlist", label: "Watchlist", icon: Eye },
  { href: "/admin", label: "Analytics", icon: BarChart2 }, // ← new
  { href: "/settings", label: "Settings", icon: Settings },
];
```

No other changes needed — the `NAV.map()` loop handles it automatically.

---

## Files Changed

| Action | Path                                                          |
| ------ | ------------------------------------------------------------- |
| Create | `supabase/migrations/20260421000001_jsearch_extra_fields.sql` |
| Modify | `src/lib/pipeline/jsearch.ts`                                 |
| Modify | `src/lib/pipeline/opportunities.ts`                           |
| Modify | `src/lib/pipeline/steps/discover.ts`                          |
| Modify | `src/lib/supabase/types.ts`                                   |
| Modify | `src/components/sidebar-nav.tsx`                              |
| Create | `src/app/(app)/admin/page.tsx`                                |
| Create | `src/app/(app)/admin/_loaders/admin-analytics.ts`             |
| Create | `src/app/(app)/admin/_components/admin-dashboard-client.tsx`  |
| Create | `src/app/(app)/admin/_components/discovery-chart.tsx`         |
| Create | `src/app/(app)/admin/_components/stage-funnel-chart.tsx`      |
| Create | `src/app/(app)/admin/_components/score-dist-chart.tsx`        |
| Create | `src/app/(app)/admin/_components/remote-chart.tsx`            |
| Create | `src/app/(app)/admin/_components/top-companies-chart.tsx`     |
| Create | `src/app/(app)/admin/_components/top-roles-chart.tsx`         |
| Create | `src/app/(app)/admin/_components/salary-chart.tsx`            |
| CLI    | `src/components/ui/chart.tsx` (via `npx shadcn add chart`)    |

---

## Verification

1. `npx tsc --noEmit` — zero errors (new fields are all optional/nullable, fully backward compatible)
2. Apply migration via `supabase db push` — confirm 9 columns appear in Studio
3. Trigger one pipeline run — inspect inserted row, confirm `job_city`, `job_is_remote`, etc. are populated (or null if JSearch didn't provide them)
4. Navigate to `/admin` — charts render without JS errors; empty states show gracefully with zero data
5. `npm run build` — clean build (recharts imports only appear inside `"use client"` files)
