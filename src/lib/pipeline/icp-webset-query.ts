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

  // Employee range: same null-vs-default semantics as the TheirStack
  // mapper. `max === null` means the user explicitly chose unbounded;
  // values >= 10000 are treated as default-rubric noise and dropped
  // from the natural-language hint.
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

  // Structured disqualifiers shape negative phrases — Exa weights
  // these as soft constraints, not hard filters. Behavioral and stage
  // categories phrase cleanly into natural language; tech_disqualifiers
  // overlap with technographics.excluded_tools above and would only
  // double-count, so they are skipped here. size_disqualifiers is a
  // free-text size description (e.g. "under 10 employees") that we
  // keep as-is.
  const disqualifiers = normalizedRubric.disqualifiers;
  if (disqualifiers.behavioral_disqualifiers.length) {
    parts.push(
      `excluding companies that ${disqualifiers.behavioral_disqualifiers.join(" or ")}`,
    );
  }
  if (disqualifiers.stage_disqualifiers.length) {
    parts.push(
      `not at stage ${disqualifiers.stage_disqualifiers.join(" or ")}`,
    );
  }
  if (disqualifiers.size_disqualifiers.trim()) {
    parts.push(`excluding ${disqualifiers.size_disqualifiers.trim()}`);
  }

  const query =
    parts.join(" ").trim() || "B2B SaaS companies matching an ICP profile";

  return {
    query,
    numResults: opts.numResults ?? 20,
  };
}
