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
  researched: { label: "Researched", variant: "accent" },
  needs_contact: { label: "Needs Contact", variant: "warning" },
  enriched: { label: "Enriched", variant: "accent" },
  drafted: { label: "Drafted", variant: "accent" },
  queued: { label: "Ready to Send", variant: "success" },
  sending: { label: "Sending", variant: "warning" },
  sent: { label: "Sent", variant: "success" },
  replied: { label: "Replied", variant: "success" },
  skipped: { label: "Skipped", variant: "outline" },
};
