/**
 * TheirStack Jobs Search client.
 *
 * Thin fetch wrapper. POST /v1/jobs/search returns firmographically-
 * filtered, actively-hiring companies. Free tier: 200 API credits/month,
 * 1 credit per returned job. Narrow Series B queries fit easily.
 *
 * Auth: Bearer THEIRSTACK_API_KEY.
 *
 * Request shape follows the filter surface the ICP rubric actually uses
 * — we omit the long tail of supported-but-unused filters to keep the
 * interface honest. The mapping from IcpRubric → TheirStackFilters lives
 * in `src/lib/pipeline/icp-to-theirstack-filters.ts` (pure, testable).
 *
 * Response shape is validated with zod at the boundary. Unknown fields
 * pass through; missing required fields throw. This is the pattern
 * CLAUDE.md requires for all third-party API responses.
 */

import { z } from "zod";

const THEIRSTACK_BASE = "https://api.theirstack.com";
const SEARCH_PATH = "/v1/jobs/search";

function getKey(): string {
  const key = process.env.THEIRSTACK_API_KEY;
  if (!key) throw new Error("THEIRSTACK_API_KEY is not set.");
  return key;
}

// ─── Filters ──────────────────────────────────────────────────────────────
//
// Only the subset of TheirStack filters that icpToTheirStackFilters
// actually emits today. Extend when a new rubric field comes online.

export type FundingStage =
  | "seed"
  | "series_a"
  | "series_b"
  | "series_c"
  | "series_d"
  | "series_e"
  | "series_f"
  | "series_g"
  | "series_h"
  | "series_i"
  | "series_j";

export interface TheirStackFilters {
  /** Required. Look-back window for job postings (days). */
  posted_at_max_age_days: number;
  /** Job-level filters. */
  job_title_or?: string[];
  job_seniority_or?: string[];
  /** Company-level filters. */
  min_employee_count?: number;
  max_employee_count?: number;
  funding_stage_or?: FundingStage[];
  company_country_code_or?: string[];
  company_keyword_slug_or?: string[];
  company_keyword_slug_not?: string[];
  industry_id_or?: number[];
  /** Response controls. */
  limit?: number;
  page?: number;
  include_total_results?: boolean;
}

// ─── Response schema ──────────────────────────────────────────────────────

const companyObjectSchema = z
  .object({
    name: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    linkedin_url: z.string().nullable().optional(),
    industry: z.string().nullable().optional(),
    industry_id: z.number().nullable().optional(),
    employee_count: z.number().nullable().optional(),
    annual_revenue_usd: z.number().nullable().optional(),
    funding_stage: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
  })
  .passthrough();

export const jobSchema = z
  .object({
    // TheirStack returns numeric IDs for jobs. Normalise to string so the
    // opportunities.external_id column (text) handles it.
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    job_title: z.string(),
    description: z.string().nullable().optional(),
    date_posted: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    short_location: z.string().nullable().optional(),
    remote: z.boolean().nullable().optional(),
    hybrid: z.boolean().nullable().optional(),
    seniority: z.string().nullable().optional(),
    employment_statuses: z.array(z.string()).nullable().optional(),
    company: z.string().nullable().optional(),
    company_domain: z.string().nullable().optional(),
    company_object: companyObjectSchema.nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .passthrough();

const responseSchema = z
  .object({
    data: z.array(jobSchema),
    metadata: z
      .object({
        total_results: z.number().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type TheirStackJob = z.infer<typeof jobSchema>;
export type TheirStackResponse = z.infer<typeof responseSchema>;

// ─── Search ───────────────────────────────────────────────────────────────

export interface SearchJobsOptions {
  /** Override fetch (tests inject a stub). */
  fetchImpl?: typeof fetch;
}

/**
 * POST /v1/jobs/search. Throws on HTTP error or zod parse failure.
 *
 * Callers are responsible for rate limiting — this function does not
 * consult THEIRSTACK_DAILY_CREDIT_CAP. Phase 2 logs per-run credit spend
 * (one credit per job in the response).
 */
export async function searchJobs(
  filters: TheirStackFilters,
  opts: SearchJobsOptions = {},
): Promise<TheirStackJob[]> {
  const fetchFn = opts.fetchImpl ?? fetch;

  const res = await fetchFn(`${THEIRSTACK_BASE}${SEARCH_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify(filters),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `TheirStack searchJobs failed: ${res.status} ${body.slice(0, 500)}`,
    );
  }

  const raw = (await res.json()) as unknown;
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `TheirStack response failed schema validation: ${parsed.error.message}`,
    );
  }

  return parsed.data.data;
}
