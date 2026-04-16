import type { OpportunityStage } from "@/lib/supabase/types";

export type StageVariant =
  | "outline"
  | "secondary"
  | "success"
  | "warning"
  | "accent";

export const STAGE_CONFIG: Record<
  OpportunityStage,
  { label: string; variant: StageVariant }
> = {
  discovered: { label: "Discovered", variant: "outline" },
  scored: { label: "Scored", variant: "accent" },
  filtered: { label: "Filtered", variant: "outline" },
  researched: { label: "Researched", variant: "secondary" },
  needs_contact: { label: "Needs Contact", variant: "warning" },
  enriched: { label: "Enriched", variant: "secondary" },
  drafted: { label: "Drafted", variant: "secondary" },
  queued: { label: "Ready to Send", variant: "outline" },
  sending: { label: "Sending", variant: "warning" },
  sent: { label: "Sent", variant: "outline" },
  replied: { label: "Replied", variant: "outline" },
  skipped: { label: "Skipped", variant: "outline" },
};
