/**
 * Pipeline Step: Enrich
 *
 * Uses Exa Websets enrichment API (POST /websets/{websetId}/enrichments) to
 * discover work email for the selected person item.
 *
 * Retry logic: increments enrichment_attempts each try (including errors).
 * - Email found: advances to 'enriched'
 * - No email, retries left: stays at 'researched' (will retry next run)
 * - No email or error, retries exhausted: advances to 'needs_contact'
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpportunityRow } from "@/lib/supabase/types";
import { WEBSETS_BASE } from "@/lib/ai/exa";
import {
  claimOpportunity,
  releaseOpportunity,
  advanceStage,
} from "@/lib/pipeline/opportunities";
import { assertEnv } from "@/lib/utils";

const MAX_ENRICH_PER_RUN = 5;
const STALE_CLAIM_MINUTES = 10;

export interface EnrichResult {
  processed: number;
  enriched: number;
  retrying: number;
  needsContact: number;
  errors: number;
}

export async function runEnrich(
  svc: SupabaseClient,
  userId: string,
): Promise<EnrichResult> {
  // Select opportunities at 'researched' that have both webset ID and item ID,
  // haven't exhausted retries, and are either unclaimed or stale-claimed (>10 min).
  const staleCutoff = new Date(
    Date.now() - STALE_CLAIM_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: opportunities, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .eq("stage", "researched")
    .not("recipient_webset_id", "is", null)
    .not("recipient_webset_item_id", "is", null)
    .or(`processing_started_at.is.null,processing_started_at.lt.${staleCutoff}`)
    .order("discovered_at", { ascending: true })
    .limit(MAX_ENRICH_PER_RUN);

  if (error) throw error;

  const result: EnrichResult = {
    processed: 0,
    enriched: 0,
    retrying: 0,
    needsContact: 0,
    errors: 0,
  };

  for (const opp of (opportunities ?? []) as OpportunityRow[]) {
    if (opp.enrichment_attempts >= opp.max_enrichment_attempts) {
      // Already exhausted — advance to needs_contact and clean up webset
      const advanced = await advanceStage(
        svc,
        opp.id,
        userId,
        "researched",
        "needs_contact",
        {},
      );
      if (!advanced) {
        // Stage already moved (concurrent run or prior recovery) — skip
        continue;
      }
      const apiKey = process.env.EXA_API_KEY;
      if (apiKey && opp.recipient_webset_id) {
        await deleteWebsetQuietly(apiKey, opp.recipient_webset_id);
      }
      result.needsContact++;
      continue;
    }

    let claimed = false;
    try {
      claimed = await claimOpportunity(svc, opp.id, userId);
      if (!claimed) continue;

      result.processed++;
      const outcome = await processOneEnrich(svc, userId, opp);

      if (outcome === "enriched") result.enriched++;
      else if (outcome === "needs_contact") result.needsContact++;
      else result.retrying++;
    } catch (err) {
      result.errors++;
      const newAttempts = opp.enrichment_attempts + 1;
      const isExhausted = newAttempts >= opp.max_enrichment_attempts;

      // Increment attempts; use stage-preconditioned transition for exhausted rows
      await svc
        .from("opportunities")
        .update({
          last_error: err instanceof Error ? err.message : String(err),
          enrichment_attempts: newAttempts,
        })
        .eq("id", opp.id)
        .eq("user_id", userId);

      if (isExhausted) {
        // Stage precondition may miss if a concurrent run already moved it
        await advanceStage(
          svc,
          opp.id,
          userId,
          "researched",
          "needs_contact",
          {},
        );

        // Best-effort cleanup — use process.env directly so a missing key
        // doesn't throw and skip releaseOpportunity
        const apiKey = process.env.EXA_API_KEY;
        if (apiKey && opp.recipient_webset_id) {
          await deleteWebsetQuietly(apiKey, opp.recipient_webset_id);
        }
      }
    } finally {
      if (claimed) {
        await releaseOpportunity(svc, opp.id, userId);
      }
    }
  }

  return result;
}

type EnrichOutcome = "enriched" | "needs_contact" | "retrying";

async function processOneEnrich(
  svc: SupabaseClient,
  userId: string,
  opp: OpportunityRow,
): Promise<EnrichOutcome> {
  const apiKey = assertEnv("EXA_API_KEY");
  const newAttempts = opp.enrichment_attempts + 1;

  // Increment attempts first
  await svc
    .from("opportunities")
    .update({ enrichment_attempts: newAttempts })
    .eq("id", opp.id)
    .eq("user_id", userId);

  const email = await enrichViaWebset(
    apiKey,
    opp.recipient_webset_id!,
    opp.recipient_webset_item_id!,
  );

  if (email) {
    const advanced = await advanceStage(
      svc,
      opp.id,
      userId,
      "researched",
      "enriched",
      {
        recipient_email: email,
      },
    );
    if (!advanced) {
      throw new Error(
        `Stage precondition missed: expected 'researched' for opportunity ${opp.id}`,
      );
    }
    // Webset is no longer needed — clean up to avoid orphans
    await deleteWebsetQuietly(apiKey, opp.recipient_webset_id!);
    return "enriched";
  }

  if (newAttempts >= opp.max_enrichment_attempts) {
    const advanced = await advanceStage(
      svc,
      opp.id,
      userId,
      "researched",
      "needs_contact",
      {},
    );
    if (!advanced) {
      throw new Error(
        `Stage precondition missed: expected 'researched' for opportunity ${opp.id}`,
      );
    }
    // Terminal — clean up the webset
    await deleteWebsetQuietly(apiKey, opp.recipient_webset_id!);
    return "needs_contact";
  }

  // Stays at 'researched' for retry on next run — preserve webset for next attempt
  return "retrying";
}

// ---------------------------------------------------------------------------
// Exa Websets enrichment — documented endpoint:
// POST /websets/{websetId}/enrichments (create)
// GET  /websets/{websetId}/enrichments/{enrichmentId} (poll)
// ---------------------------------------------------------------------------

interface CreateEnrichmentResponse {
  id: string;
  object: "enrichment";
  websetId: string;
  status: string;
}

// Per Exa docs: statuses are "pending", "completed", "canceled"
// https://exa.ai/docs/websets/api/websets/enrichments/get-an-enrichment
interface EnrichmentPollResponse {
  id: string;
  object: "enrichment";
  websetId: string;
  status: "pending" | "completed" | "canceled";
}

export async function enrichViaWebset(
  apiKey: string,
  websetId: string,
  targetItemId: string,
): Promise<string | null> {
  // Step 1: Create enrichment on the webset
  const createRes = await fetch(
    `${WEBSETS_BASE}/websets/${websetId}/enrichments`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        description: "Find this person's work email address",
        format: "email",
      }),
    },
  );

  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(
      `Exa create enrichment failed: ${createRes.status} ${body}`,
    );
  }

  const enrichment = (await createRes.json()) as CreateEnrichmentResponse;

  // Step 2: Poll until enrichment completes
  await waitForEnrichment(apiKey, websetId, enrichment.id);

  // Step 3: Read enrichment results for the target item
  const itemsRes = await fetch(
    `${WEBSETS_BASE}/websets/${websetId}/items?limit=100`,
    {
      headers: { "x-api-key": apiKey },
    },
  );

  if (!itemsRes.ok) {
    const body = await itemsRes.text();
    throw new Error(`Exa read items failed: ${itemsRes.status} ${body}`);
  }

  const items = (await itemsRes.json()) as {
    data: Array<{
      id: string;
      enrichments: Array<{
        enrichmentId: string;
        result: string[] | null;
      }> | null;
    }>;
  };

  // Find the target item's enrichment results
  const targetItem = items.data?.find((item) => item.id === targetItemId);
  if (!targetItem?.enrichments?.length) return null;

  // Find the enrichment we just created
  const ourEnrichment = targetItem.enrichments.find(
    (e) => e.enrichmentId === enrichment.id,
  );

  return ourEnrichment?.result?.[0] ?? null;
}

async function waitForEnrichment(
  apiKey: string,
  websetId: string,
  enrichmentId: string,
  timeoutMs = 60_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `${WEBSETS_BASE}/websets/${websetId}/enrichments/${enrichmentId}`,
      {
        headers: { "x-api-key": apiKey },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Exa enrichment poll failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as EnrichmentPollResponse;
    if (data.status === "completed") return;
    // Canceled enrichments should fail fast — treat as retryable error
    if (data.status === "canceled") {
      throw new Error(`Enrichment ${enrichmentId} was canceled by Exa`);
    }
    // "pending" → continue polling

    await new Promise((r) => setTimeout(r, 3000));
  }

  throw new Error(
    `Enrichment ${enrichmentId} timed out after ${timeoutMs / 1000}s`,
  );
}

/**
 * Best-effort webset deletion. Swallows errors because cleanup failure
 * should not block the pipeline — orphaned websets are low-impact.
 */
export async function deleteWebsetQuietly(
  apiKey: string,
  websetId: string,
): Promise<void> {
  try {
    await fetch(`${WEBSETS_BASE}/websets/${websetId}`, {
      method: "DELETE",
      headers: { "x-api-key": apiKey },
    });
  } catch {
    // Swallow — cleanup is best-effort
  }
}
