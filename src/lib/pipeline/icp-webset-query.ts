/**
 * IcpRubric → Exa dormant-ICP discovery query.
 *
 * Pure function. No I/O. Builds a natural-language search query from
 * firmographic + technographic rubric fields ONLY — hiring signals are
 * deliberately omitted because TheirStack already covers the
 * actively-hiring subset. Dormant discovery finds the long tail:
 * companies that match the ICP shape but aren't posting jobs this week.
 *
 * The "webset" filename reflects the plan's nomenclature; Phase 4 uses
 * plain `exaSearch` rather than the async Exa Websets API so the cron
 * can create-and-fetch in one synchronous sweep. Switching to Websets
 * later is a two-line change in discover-dormant.ts.
 */

import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { coerceIcpRubric } from "@/lib/onboarding/icp-schemas";

export interface IcpWebsetQuery {
  query: string;
  numResults: number;
}

export interface IcpWebsetQueryOptions {
  numResults?: number;
}

export function buildIcpWebsetQuery(
  rubric: IcpRubric,
  opts: IcpWebsetQueryOptions = {},
): IcpWebsetQuery {
  const normalizedRubric = coerceIcpRubric(rubric);
  const parts: string[] = [];

  const firmo = normalizedRubric.firmographics;
  if (firmo?.industries?.length) {
    parts.push(firmo.industries.join(" / "));
  }
  parts.push("companies");

  if (firmo?.stages?.length) {
    parts.push(`at ${firmo.stages.join(" or ")}`);
  }

  const min = firmo?.employee_range.min;
  const max = firmo?.employee_range.max;
  const meaningfulRange =
    (typeof min === "number" && min > 0) ||
    (typeof max === "number" && max < 10000);
  if (meaningfulRange) {
    const lo = typeof min === "number" && min > 0 ? min : 0;
    const hi = typeof max === "number" && max < 10000 ? max : 10000;
    parts.push(`with ${lo}-${hi} employees`);
  }

  if (firmo?.geographies?.length) {
    parts.push(`in ${firmo.geographies.join(" or ")}`);
  }

  const techno = normalizedRubric.technographics;
  if (techno?.required_tools?.length) {
    parts.push(`using ${techno.required_tools.join(" or ")}`);
  }
  if (techno?.excluded_tools?.length) {
    parts.push(`not using ${techno.excluded_tools.join(" or ")}`);
  }

  const query =
    parts.join(" ").trim() || "B2B SaaS companies matching an ICP profile";

  return {
    query,
    numResults: opts.numResults ?? 20,
  };
}
