/**
 * Pipeline Step: Discover Dormant ICP-fit accounts (GTM secondary lane).
 *
 * TheirStack covers the firmographic-fit subset that's *actively hiring*.
 * This step covers the long tail — companies that match the ICP shape
 * but aren't posting jobs this week. Runs on the weekly dormant cron,
 * not the main pipeline schedule, because the recall is a dormant
 * backfill rather than a same-day signal.
 *
 * Dedup:
 *   - Skips any company_domain already present on the user's
 *     opportunities as source='theirstack' or source='exa-dormant'
 *     (we don't want to re-score the same company once a week).
 *   - Unique constraint (user_id, source, external_id) catches
 *     intra-run duplicates if Exa returns the same URL twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoverResult } from "@/lib/pipeline/steps/discover";
import { createOpportunity } from "@/lib/pipeline/opportunities";
import { exaSearch } from "@/lib/ai/exa";
import { buildIcpWebsetQuery } from "@/lib/pipeline/icp-webset-query";
import type { IcpRubric } from "@/lib/pipeline/icp-to-theirstack-filters";
import { createLogger } from "@/lib/logger";

const MAX_DISCOVERIES_PER_RUN = 20;

export async function runDiscoverDormant(
  svc: SupabaseClient,
  userId: string,
  rubric: IcpRubric,
  runId?: string,
): Promise<DiscoverResult> {
  const log = createLogger({
    runId,
    userId,
    scope: "discover-dormant",
  });

  const { query, numResults } = buildIcpWebsetQuery(rubric);
  log.info(`exa dormant query: ${query.slice(0, 200)} (n=${numResults})`);

  const results = await exaSearch({ query, numResults, includeText: true });
  log.info(`exa returned ${results.length} candidate urls`);

  // Dedup against any company_domain we've already landed via TheirStack
  // or a prior dormant sweep. Exa often surfaces the same set of
  // "obvious" companies on repeat queries; we want each scored once.
  const { data: existingRows } = await svc
    .from("opportunities")
    .select("company_domain")
    .eq("user_id", userId)
    .in("source", ["theirstack", "exa-dormant", "yt_comments"])
    .not("company_domain", "is", null);

  const existingDomains = new Set(
    (existingRows ?? [])
      .map((r) => (r.company_domain as string | null)?.toLowerCase())
      .filter((d): d is string => typeof d === "string" && d.length > 0),
  );

  let inserted = 0;
  let skippedExisting = 0;
  for (const r of results) {
    if (inserted >= MAX_DISCOVERIES_PER_RUN) break;

    const domain = extractDomain(r.url);
    if (!domain) continue;

    if (existingDomains.has(domain)) {
      skippedExisting++;
      continue;
    }

    const companyName = deriveCompanyName(r.title ?? null, domain);

    try {
      const created = await createOpportunity(svc, userId, {
        source: "exa-dormant",
        external_id: r.url ?? domain,
        company_name: companyName,
        company_domain: domain,
        role_title: null,
        job_url: r.url ?? undefined,
        job_description: r.text ?? undefined,
        trigger_signals: [buildTriggerSignal(query, r.url ?? null)],
        buyer_personas: [],
      });

      if (created) {
        inserted++;
        existingDomains.add(domain);
      }
    } catch (err) {
      log.error("failed to insert dormant account", err, {
        domain,
      });
    }
  }

  log.info("dormant discovery complete", {
    found: results.length,
    inserted,
    skippedExisting,
  });

  return { found: results.length, inserted };
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// Exa's result titles tend to look like "AcmeCo - Revenue operations
// platform for …". Strip everything after the first separator and
// fall back to the bare domain when titles aren't reliable.
function deriveCompanyName(title: string | null, domain: string): string {
  if (title) {
    const cleaned = title.split(/[|–—\-:·]/)[0]?.trim();
    if (cleaned && cleaned.length > 0 && cleaned.length < 120) {
      return cleaned;
    }
  }
  // Domain fallback: strip tld fragments and capitalise. This is rough
  // but gives the scorer a human-readable label to work with.
  const bare = domain.split(".")[0] ?? domain;
  return bare.length > 0
    ? bare.charAt(0).toUpperCase() + bare.slice(1)
    : domain;
}

function buildTriggerSignal(
  query: string,
  sourceUrl: string | null,
): Record<string, unknown> {
  return {
    source: "exa-dormant",
    matched_on_query: query.slice(0, 500),
    source_url: sourceUrl,
    discovered_at: new Date().toISOString(),
  };
}
