/**
 * JSearch API client — structured job discovery via RapidAPI.
 * Ported from scripts/search-gtm-jobs.mjs into a reusable module.
 */

import { z } from "zod";
import { assertEnv } from "@/lib/utils";

const JSearchResultSchema = z.object({
  job_id: z.string(),
  job_title: z.string(),
  employer_name: z.string(),
  job_city: z.string().nullable().default(null),
  job_state: z.string().nullable().default(null),
  job_country: z.string().default("us"),
  job_is_remote: z.boolean().nullable().default(null),
  job_apply_link: z.string(),
  job_description: z.string().nullable().default(null),
  job_employment_type: z.string().nullable().default(null),
  job_min_salary: z.number().nullable().default(null),
  job_max_salary: z.number().nullable().default(null),
  job_salary_currency: z.string().nullable().default(null),
  job_salary_period: z.string().nullable().default(null),
  job_posted_at_datetime_utc: z.string().nullable().default(null),
  job_required_skills: z.array(z.string()).nullable().default(null),
  // Parsed for schema safety but never stored — redundant with job_description
  job_highlights: z
    .object({
      Qualifications: z.array(z.string()).optional(),
      Responsibilities: z.array(z.string()).optional(),
    })
    .nullable()
    .default(null),
});

export type JSearchResult = z.infer<typeof JSearchResultSchema>;

interface SearchOptions {
  numPages?: number;
  datePosted?: string;
  country?: string;
  employmentTypes?: string;
  remoteOnly?: boolean;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;
const THROTTLE_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJSearch(
  query: string,
  options: SearchOptions = {},
): Promise<JSearchResult[]> {
  const apiKey = assertEnv("RAPIDAPI_KEY");

  const params = new URLSearchParams({
    query,
    page: "1",
    num_pages: String(options.numPages ?? 3),
    date_posted: options.datePosted ?? "month",
    country: options.country ?? "us",
  });

  if (options.remoteOnly) params.set("remote_jobs_only", "true");
  if (options.employmentTypes)
    params.set("employment_types", options.employmentTypes);

  const url = `https://jsearch.p.rapidapi.com/search?${params}`;
  const headers = {
    "X-RapidAPI-Key": apiKey,
    "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
  };

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers });

    const remaining = res.headers.get("x-ratelimit-requests-remaining");
    const limit = res.headers.get("x-ratelimit-requests-limit");
    if (remaining !== null) {
      console.log(`[jsearch] quota: ${remaining}/${limit} requests remaining`);
    }

    if (res.ok) {
      const body = await res.json();
      const rawRows = Array.isArray(body.data) ? body.data : [];
      return rawRows.flatMap((raw: unknown) => {
        const result = JSearchResultSchema.safeParse(raw);
        if (!result.success) {
          console.warn(
            "[jsearch] Skipping malformed record:",
            result.error.issues[0],
          );
          return [];
        }
        return [result.data];
      });
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = res.headers.get("Retry-After");
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      console.warn(
        `[jsearch] 429 rate-limited (${remaining ?? "?"}/${limit ?? "?"} remaining), retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
      );
      await sleep(waitMs);
      continue;
    }

    throw new Error(`JSearch API ${res.status}: ${res.statusText}`);
  }

  throw new Error("JSearch API: max retries exceeded");
}

interface SearchJobsOptions {
  /** Number of JSearch pages per query×location combo (default: 3). */
  numPages?: number;
  /** JSearch date filter — "3days", "week", "month" (default: "month"). */
  datePosted?: string;
}

/**
 * Search for jobs across multiple queries and locations. Deduplicates by job_id.
 */
export async function searchJobs(
  queries: string[],
  locations: string[],
  options: SearchJobsOptions = {},
): Promise<JSearchResult[]> {
  const allResults: JSearchResult[] = [];
  let isFirstRequest = true;

  for (const query of queries) {
    for (const location of locations) {
      if (!isFirstRequest) await sleep(THROTTLE_MS);
      isFirstRequest = false;

      const results = await fetchJSearch(`${query} in ${location}`, {
        numPages: options.numPages ?? 3,
        datePosted: options.datePosted ?? "month",
        employmentTypes: "FULLTIME",
        country: "us",
      });
      allResults.push(...results);
    }
  }

  const seen = new Set<string>();
  return allResults.filter((job) => {
    if (seen.has(job.job_id)) return false;
    seen.add(job.job_id);
    return true;
  });
}
