import type { OpportunityStage } from "@/lib/supabase/types";

// Stages a row can be skipped *from*. Lives in a neutral module so that
// both `"use server"` action files and RSC pages can import it — a
// `"use server"` module can only export async functions, so this can't
// live alongside the skip/flag actions themselves.
export const SKIPPABLE_STAGES: OpportunityStage[] = [
  "discovered",
  "scored",
  "filtered",
  "researched",
  "needs_contact",
  "enriched",
  "drafted",
  "queued",
];
