/**
 * Deterministic Plan Executor — follows pursuit planner decisions.
 *
 * Phase 13C: for each planned opportunity, executes the planner's strategy
 * using existing pipeline helpers. No autonomous decision-making — the
 * planner decided, the executor follows.
 *
 * Terminal outcomes: every opportunity ends in exactly one of:
 *   - "queued" (research → enrich → draft succeeded)
 *   - "needs_contact" (contact found but no email, or research succeeded but enrich failed)
 *   - "skipped" (planner said skip, or no contact after fallbacks)
 *
 * Budget guardrails:
 *   - MAX_PURSUITS_PER_RUN = 5
 *   - max_fallback_targets = 3 (primary + 2 fallbacks)
 *   - max_enrichment_attempts per opportunity: 1
 *   - max_people_search_attempts per opportunity: 2
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimOpportunity,
  releaseOpportunity,
  advanceStage,
} from "@/lib/pipeline/opportunities";
import {
  researchPeople,
  type ContactArchetype,
  type PeopleSearchResult,
} from "@/lib/pipeline/people-search";
import { addToWatchlist } from "@/lib/pipeline/watchlist";
import type { PursuitPlanEntry } from "@/lib/pipeline/workflow";

/* ── Result types ────────────────────────────────────────────────── */

export interface ExecutorResult {
  processed: number;
  researched: number;
  skipped: number;
  needsContact: number;
  watchlisted: number;
  errors: number;
}

/* ── Main executor ───────────────────────────────────────────────── */

export async function executePlans(
  svc: SupabaseClient,
  userId: string,
  plans: PursuitPlanEntry[],
): Promise<ExecutorResult> {
  const result: ExecutorResult = {
    processed: 0,
    researched: 0,
    skipped: 0,
    needsContact: 0,
    watchlisted: 0,
    errors: 0,
  };

  for (const entry of plans) {
    try {
      result.processed++;

      if (entry.plan.mode === "skip") {
        await executeSkip(svc, userId, entry);
        result.skipped++;
      } else {
        const outcome = await executePursuit(svc, userId, entry);
        if (outcome === "researched") result.researched++;
        else if (outcome === "needs_contact") result.needsContact++;
        else if (outcome === "skipped") result.skipped++;
      }

      // Watchlist is additive — does not replace terminal outcome
      if (entry.plan.watchlist_recommendation) {
        try {
          await addToWatchlist(svc, userId, entry.companyName, "auto");
          result.watchlisted++;
        } catch {
          // Watchlist failure is non-blocking
          console.log(
            `[executor] watchlist add failed for ${entry.companyName}`,
          );
        }
      }
    } catch (err) {
      result.errors++;
      console.log(
        `[executor] error processing ${entry.companyName}: ${err instanceof Error ? err.message : String(err)}`,
      );

      // Write error to opportunity
      await svc
        .from("opportunities")
        .update({
          last_error: err instanceof Error ? err.message : String(err),
        })
        .eq("id", entry.opportunityId)
        .eq("user_id", userId);
    }
  }

  return result;
}

/* ── Skip execution ──────────────────────────────────────────────── */

async function executeSkip(
  svc: SupabaseClient,
  userId: string,
  entry: PursuitPlanEntry,
): Promise<void> {
  console.log(
    `[executor] skipping ${entry.companyName}: ${entry.plan.skip_reason}`,
  );

  const advanced = await advanceStage(
    svc,
    entry.opportunityId,
    userId,
    "scored",
    "skipped",
    {
      last_error: `Planner skip: ${entry.plan.skip_reason ?? "unspecified"}`,
    },
  );

  if (!advanced) {
    console.log(
      `[executor] skip stage transition missed for ${entry.companyName} — already moved`,
    );
  }
}

/* ── Pursuit execution with fallback chain ────────────────────────── */

async function executePursuit(
  svc: SupabaseClient,
  userId: string,
  entry: PursuitPlanEntry,
): Promise<"researched" | "needs_contact" | "skipped"> {
  console.log(
    `[executor] pursuing ${entry.companyName}: mode=${entry.plan.mode}, target=${entry.plan.target_contact}`,
  );

  const claimed = await claimOpportunity(svc, entry.opportunityId, userId);
  if (!claimed) {
    console.log(
      `[executor] could not claim ${entry.companyName} — already processing`,
    );
    return "needs_contact";
  }

  try {
    const { data: opp } = await svc
      .from("opportunities")
      .select("*")
      .eq("id", entry.opportunityId)
      .single();

    if (!opp || opp.stage !== "scored") {
      console.log(
        `[executor] ${entry.companyName} not in scored stage (${opp?.stage}) — skipping`,
      );
      return "needs_contact";
    }

    // Build ordered list of archetypes to try: primary + fallbacks, capped at 3
    const MAX_ARCHETYPE_ATTEMPTS = 3;
    const archetypes: ContactArchetype[] = [
      entry.plan.target_contact as ContactArchetype,
      ...(entry.plan.fallback_target_order as ContactArchetype[]),
    ].slice(0, MAX_ARCHETYPE_ATTEMPTS);

    let research: PeopleSearchResult | null = null;
    let lastReportId: string | null = null;
    const attemptedTargets: string[] = [];

    // Fallback chain: try each archetype in order
    for (const archetype of archetypes) {
      attemptedTargets.push(archetype);
      console.log(
        `[executor] ${entry.companyName}: trying archetype=${archetype}`,
      );

      research = await researchPeople(
        opp.company_name,
        opp.role_title,
        userId,
        svc,
        { targetContact: archetype },
      );

      // Store research report for this attempt
      const { data: report, error: reportError } = await svc
        .from("research_reports")
        .insert({
          user_id: userId,
          company_name: opp.company_name,
          role_title: opp.role_title,
          research_type: "people-research",
          status: "complete",
          input: {
            company_name: opp.company_name,
            role_title: opp.role_title,
            source: "pursuit-executor",
            plan_mode: entry.plan.mode,
            plan_target: archetype,
            attempted_targets: attemptedTargets,
          },
          result: research.researchResult,
        })
        .select("id")
        .single();

      if (reportError) throw reportError;
      lastReportId = report.id;

      const isEnrichable =
        !!research.recipientName &&
        !!research.recipientWebsetId &&
        !!research.recipientWebsetItemId;

      if (isEnrichable) {
        const advanced = await advanceStage(
          svc,
          entry.opportunityId,
          userId,
          "scored",
          "researched",
          {
            research_id: report.id,
            recipient_name: research.recipientName,
            recipient_title: research.recipientTitle,
            recipient_webset_id: research.recipientWebsetId,
            recipient_webset_item_id: research.recipientWebsetItemId,
          },
        );

        if (!advanced) {
          throw new Error(
            `Stage transition scored→researched missed for ${entry.companyName} (${entry.opportunityId}) — row already moved`,
          );
        }

        console.log(
          `[executor] ${entry.companyName}: researched → ${research.recipientName} (archetype=${archetype})`,
        );

        return "researched";
      }

      console.log(
        `[executor] ${entry.companyName}: no enrichable contact for archetype=${archetype}`,
      );

      // Light mode stops after first failed attempt — don't retry fallbacks
      if (entry.plan.mode === "light") break;
    }

    // All archetypes exhausted without finding enrichable contact
    const targetStage =
      entry.plan.mode === "light" ? "skipped" : "needs_contact";

    console.log(
      `[executor] ${entry.companyName}: no contact after [${attemptedTargets.join(", ")}] → ${targetStage}`,
    );

    const advanced = await advanceStage(
      svc,
      entry.opportunityId,
      userId,
      "scored",
      targetStage,
      {
        research_id: lastReportId,
        recipient_name: research?.recipientName ?? null,
        recipient_title: research?.recipientTitle ?? null,
        ...(targetStage === "skipped"
          ? {
              last_error: `Pursuit executor: no enrichable contact after trying [${attemptedTargets.join(", ")}] (mode=${entry.plan.mode})`,
            }
          : {}),
      },
    );

    if (!advanced) {
      throw new Error(
        `Stage transition scored→${targetStage} missed for ${entry.companyName} (${entry.opportunityId}) — row already moved`,
      );
    }

    return targetStage as "skipped" | "needs_contact";
  } finally {
    await releaseOpportunity(svc, entry.opportunityId, userId);
  }
}
