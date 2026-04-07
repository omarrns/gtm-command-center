/**
 * JSearch API client — structured job discovery via RapidAPI.
 * Ported from scripts/search-gtm-jobs.mjs into a reusable module.
 */

import { assertEnv } from "@/lib/utils";

export interface JSearchResult {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_city: string | null;
  job_state: string | null;
  job_country: string;
  job_is_remote: boolean;
  job_apply_link: string;
  job_description: string | null;
  job_employment_type: string | null;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_currency: string | null;
  job_salary_period: string | null;
  job_posted_at_datetime_utc: string | null;
  job_required_skills: string[] | null;
  job_highlights: {
    Qualifications?: string[];
    Responsibilities?: string[];
  } | null;
}

interface SearchOptions {
  numPages?: number;
  datePosted?: string;
  country?: string;
  employmentTypes?: string;
  remoteOnly?: boolean;
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

  const res = await fetch(`https://jsearch.p.rapidapi.com/search?${params}`, {
    headers: {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
  });

  if (!res.ok) {
    throw new Error(`JSearch API ${res.status}: ${res.statusText}`);
  }

  const body = await res.json();
  return (body.data as JSearchResult[]) ?? [];
}

/**
 * Search for jobs across multiple queries and locations. Deduplicates by job_id.
 */
export async function searchJobs(
  queries: string[],
  locations: string[],
): Promise<JSearchResult[]> {
  const allResults: JSearchResult[] = [];

  for (const query of queries) {
    for (const location of locations) {
      const results = await fetchJSearch(`${query} in ${location}`, {
        numPages: 3,
        datePosted: "month",
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
