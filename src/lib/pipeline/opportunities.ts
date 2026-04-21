/**
 * Opportunity CRUD + atomic claiming helpers.
 * All writes use the service client (bypasses RLS). Every query is scoped to user_id.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OpportunityRow,
  OpportunitySource,
  OpportunityStage,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

interface CreateOpportunityInput {
  source: OpportunitySource;
  external_id: string;
  company_name: string;
  role_title: string;
  job_url?: string;
  job_description?: string;
  job_posted_at?: string;
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

/**
 * Insert a new opportunity. Uses ON CONFLICT DO NOTHING on (user_id, source, external_id).
 * Also checks for a duplicate company+role within the last 30 days.
 * Returns the row if inserted, null if duplicate.
 *
 * The 30-day window prevents re-scoring a role the user already saw this
 * month while still allowing re-discovery if the same company re-posts
 * or a new listing cycle begins. This balances freshness against inbox
 * noise — JSearch often returns the same employer/title across runs.
 */
export async function createOpportunity(
  svc: SupabaseClient,
  userId: string,
  input: CreateOpportunityInput,
): Promise<OpportunityRow | null> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: existing } = await svc
    .from("opportunities")
    .select("id")
    .eq("user_id", userId)
    .eq("company_name", input.company_name)
    .eq("role_title", input.role_title)
    .gte("discovered_at", thirtyDaysAgo)
    .limit(1)
    .maybeSingle();

  if (existing) return null;

  const { data, error } = await svc
    .from("opportunities")
    .upsert(
      { user_id: userId, ...input },
      { onConflict: "user_id,source,external_id", ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();

  if (error) throw error;
  return data as OpportunityRow | null;
}

// ---------------------------------------------------------------------------
// Claim / Release (row-level locking for pipeline runs)
// ---------------------------------------------------------------------------

/**
 * Atomically claim an opportunity for processing via a single SQL RPC.
 * Sets processing_started_at and increments attempt_count in one statement.
 * Stale claims (>10 min) are auto-recovered.
 */
export async function claimOpportunity(
  svc: SupabaseClient,
  id: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await svc.rpc("claim_opportunity", {
    p_id: id,
    p_user_id: userId,
  });

  if (error) throw error;
  return data === true;
}

/**
 * Release the claim after processing completes.
 * Throws if the update fails so callers know the claim was not cleared.
 */
export async function releaseOpportunity(
  svc: SupabaseClient,
  id: string,
  userId: string,
): Promise<void> {
  const { error } = await svc
    .from("opportunities")
    .update({ processing_started_at: null })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`releaseOpportunity(${id}) failed: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Stage transitions
// ---------------------------------------------------------------------------

/**
 * Advance an opportunity from one stage to another, with stage precondition.
 * Throws on Supabase errors (RLS, trigger failures, etc.).
 * Returns true if the update matched, false if stage precondition missed.
 */
export async function advanceStage(
  svc: SupabaseClient,
  id: string,
  userId: string,
  expectedStage: OpportunityStage,
  newStage: OpportunityStage,
  updates: Partial<OpportunityRow> = {},
): Promise<boolean> {
  const { data, error } = await svc
    .from("opportunities")
    .update({ ...updates, stage: newStage })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("stage", expectedStage)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `advanceStage(${id}, ${expectedStage} -> ${newStage}) failed: ${error.message}`,
    );
  }

  return data !== null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get opportunities discovered on a specific date (for Today view).
 */
export async function getOpportunitiesByDate(
  svc: SupabaseClient,
  userId: string,
  date: string,
): Promise<OpportunityRow[]> {
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const { data, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .gte("discovered_at", startOfDay)
    .lte("discovered_at", endOfDay)
    .order("discovered_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as OpportunityRow[];
}

/**
 * Get opportunities currently in any of the given stages (no date filter).
 * Used by Today to surface actionable work regardless of discovery date —
 * an opportunity discovered last week but queued today still belongs on Today.
 */
export async function getOpportunitiesByStages(
  svc: SupabaseClient,
  userId: string,
  stages: OpportunityStage[],
): Promise<OpportunityRow[]> {
  const { data, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .in("stage", stages)
    .order("discovered_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as OpportunityRow[];
}

interface HistoryFilters {
  stage?: OpportunityStage;
  stages?: OpportunityStage[]; // allowlist — rows outside this set are excluded
  minScore?: number;
  maxScore?: number;
  company?: string;
  limit?: number;
  offset?: number;
}

/**
 * Get opportunity history with optional filters (for History view).
 */
export async function getOpportunitiesHistory(
  svc: SupabaseClient,
  userId: string,
  filters: HistoryFilters = {},
): Promise<OpportunityRow[]> {
  let query = svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .order("discovered_at", { ascending: false })
    .range(
      filters.offset ?? 0,
      (filters.offset ?? 0) + (filters.limit ?? 50) - 1,
    );

  if (filters.stages && filters.stages.length > 0)
    query = query.in("stage", filters.stages);
  if (filters.stage) query = query.eq("stage", filters.stage);
  if (filters.minScore != null) query = query.gte("score", filters.minScore);
  if (filters.maxScore != null) query = query.lte("score", filters.maxScore);
  if (filters.company)
    query = query.ilike("company_name", `%${filters.company}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OpportunityRow[];
}

/**
 * Get opportunities at a specific stage (for pipeline runner batch processing).
 * Includes both unclaimed rows and stale claims (>10 min) for recovery.
 */
export async function getOpportunitiesByStage(
  svc: SupabaseClient,
  userId: string,
  stage: OpportunityStage,
  limit: number,
): Promise<OpportunityRow[]> {
  const staleCutoff = new Date(
    Date.now() - STALE_CLAIM_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await svc
    .from("opportunities")
    .select("*")
    .eq("user_id", userId)
    .eq("stage", stage)
    .or(`processing_started_at.is.null,processing_started_at.lt.${staleCutoff}`)
    .order("discovered_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as OpportunityRow[];
}

const STALE_CLAIM_MINUTES = 10;
