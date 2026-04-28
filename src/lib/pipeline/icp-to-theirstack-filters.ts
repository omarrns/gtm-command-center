/**
 * IcpRubric → TheirStackFilters.
 *
 * Pure function. No I/O. The mapping is 1:1 for the fields that translate
 * cleanly; fields that need a lookup table (industry codes, tech slugs)
 * are omitted in Phase 2 and logged for visibility. The plan flags those
 * as Phase 2 open questions to resolve inline or in a follow-up.
 *
 * Funding stages and country codes are normalized from the rubric's
 * free-text entries to TheirStack's enum/ISO codes. Unknown values are
 * dropped — better to filter loose than to reject a good match on a typo.
 */

import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { coerceIcpRubric } from "@/lib/onboarding/icp-schemas";
import type {
  FundingStage,
  TheirStackFilters,
} from "@/lib/integrations/theirstack";

export type { IcpRubric };

// Rubric ships "Series B", "series b", "SeriesB" etc. Normalize to
// TheirStack enum form. Anything off-map gets dropped.
const FUNDING_STAGE_MAP: Record<string, FundingStage> = {
  seed: "seed",
  "pre-seed": "seed",
  preseed: "seed",
  "series a": "series_a",
  "series b": "series_b",
  "series c": "series_c",
  "series d": "series_d",
  "series e": "series_e",
  "series f": "series_f",
  "series g": "series_g",
  "series h": "series_h",
  "series i": "series_i",
  "series j": "series_j",
};

// Rubric geographies are "United States", "USA", "us", "US", etc.
// TheirStack uses ISO-3166-1 alpha-2 codes. Top markets only; unknown
// values dropped.
const COUNTRY_MAP: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  us: "US",
  america: "US",
  canada: "CA",
  ca: "CA",
  "united kingdom": "GB",
  uk: "GB",
  britain: "GB",
  england: "GB",
  gb: "GB",
  germany: "DE",
  de: "DE",
  france: "FR",
  fr: "FR",
  netherlands: "NL",
  nl: "NL",
  australia: "AU",
  au: "AU",
  india: "IN",
  in: "IN",
  ireland: "IE",
  ie: "IE",
  israel: "IL",
  il: "IL",
  singapore: "SG",
  sg: "SG",
};

function normalizeFundingStages(stages: string[] | undefined): FundingStage[] {
  if (!stages?.length) return [];
  const seen = new Set<FundingStage>();
  for (const raw of stages) {
    const key = raw.trim().toLowerCase().replace(/[_-]/g, " ");
    const mapped = FUNDING_STAGE_MAP[key];
    if (mapped) seen.add(mapped);
  }
  return Array.from(seen);
}

function normalizeCountries(geos: string[] | undefined): string[] {
  if (!geos?.length) return [];
  const seen = new Set<string>();
  for (const raw of geos) {
    const key = raw.trim().toLowerCase();
    const mapped = COUNTRY_MAP[key];
    if (mapped) seen.add(mapped);
  }
  return Array.from(seen);
}

export interface IcpToFiltersOptions {
  /** Look-back window for postings. Default 30 days (max useful for fresh signal). */
  postedMaxAgeDays?: number;
  /** Cap job rows per call. Default 25 — conserves free-tier credits. */
  limit?: number;
}

export function icpToTheirStackFilters(
  rubric: IcpRubric,
  opts: IcpToFiltersOptions = {},
): TheirStackFilters {
  const normalizedRubric = coerceIcpRubric(rubric);
  const firmo = normalizedRubric.firmographics;
  const techno = normalizedRubric.technographics;
  const signals = normalizedRubric.signals;

  const filters: TheirStackFilters = {
    posted_at_max_age_days: opts.postedMaxAgeDays ?? 30,
    limit: opts.limit ?? 25,
  };

  if (signals?.hiring_roles?.length) {
    filters.job_title_or = signals.hiring_roles;
  }

  if (firmo) {
    // Employee count: only send if the rubric supplied non-default values.
    // The extraction schema defaults to [0, 10000], which would over-filter
    // every call with a meaningless "under 10k employees" floor.
    if (firmo.employee_range.min > 0) {
      filters.min_employee_count = firmo.employee_range.min;
    }
    if (
      firmo.employee_range.max !== null &&
      firmo.employee_range.max < 10000
    ) {
      filters.max_employee_count = firmo.employee_range.max;
    }

    const fundingStages = normalizeFundingStages(firmo.stages);
    if (fundingStages.length) filters.funding_stage_or = fundingStages;

    const countries = normalizeCountries(firmo.geographies);
    if (countries.length) filters.company_country_code_or = countries;

    // industry_id_or requires LinkedIn Industry Codes V2 (numeric). Rubric
    // stores free-text ("B2B SaaS", "devtools"). A static map or an
    // industry-lookup endpoint would bridge this — see plan open questions.
    // Phase 2 ships without industry filtering; the other filters carry
    // enough signal.
  }

  // company_keyword_slug_or/not uses TheirStack's internal slug vocab.
  // Same deferral pattern as industry_id — requires a translation table
  // we don't have yet. Rubric tech hints get used in scoring instead.
  void techno;

  return filters;
}
