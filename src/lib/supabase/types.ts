// Hand-written row types for the initial migration. Replace with generated
// types from `supabase gen types typescript` once the project is linked.

export type JobStatus = "pending" | "running" | "complete" | "failed";

export interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobRow {
  id: string;
  user_id: string;
  type: string;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalysisRow {
  id: string;
  user_id: string;
  skill_slug: string;
  company_name: string | null;
  role_title: string | null;
  job_description: string | null;
  status: "draft" | "running" | "complete" | "failed";
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailDraftRow {
  id: string;
  user_id: string;
  draft_type: string;
  company_name: string | null;
  recipient_name: string | null;
  recipient_title: string | null;
  context: Record<string, unknown>;
  subject: string | null;
  body: string | null;
  variant_index: number;
  status: "draft" | "saved" | "archived";
  source_analysis_id: string | null;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchReportRow {
  id: string;
  user_id: string;
  company_name: string;
  role_title: string | null;
  research_type: string;
  status: "pending" | "running" | "complete" | "failed";
  input: Record<string, unknown>;
  result: Record<string, unknown> | null;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryDocumentRow {
  id: string;
  user_id: string;
  document_key: string;
  source_path: string | null;
  title: string;
  origin: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CoachingSessionRow {
  id: string;
  user_id: string;
  status: "pending" | "running" | "complete" | "failed";
  transcript: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  trail_entry: string | null;
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceArtifactRow {
  id: string;
  user_id: string;
  artifact_type: string;
  title: string;
  content: string | null;
  metadata: Record<string, unknown>;
  status: "pending" | "running" | "complete" | "failed";
  job_id: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Pipeline V2 types
// ---------------------------------------------------------------------------

export type OpportunityStage =
  | "discovered"
  | "scored"
  | "filtered"
  | "researched"
  | "needs_contact"
  | "enriched"
  | "drafted"
  | "queued"
  | "sending"
  | "sent"
  | "replied"
  | "skipped";

export type OpportunitySource = "jsearch" | "exa" | "manual";

export interface PipelineConfigRow {
  id: string;
  user_id: string;
  score_threshold: number;
  search_queries: string[];
  search_locations: string[];
  daily_send_cap: number;
  gmail_send_address: string | null;
  activation_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GmailCredentialsRow {
  id: string;
  user_id: string;
  encrypted_refresh_token: string;
  token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OpportunityRow {
  id: string;
  user_id: string;
  source: OpportunitySource;
  external_id: string;
  company_name: string;
  role_title: string;
  job_url: string | null;
  job_description: string | null;
  stage: OpportunityStage;
  score: number | null;
  score_components: Record<string, unknown> | null;
  analysis_id: string | null;
  research_id: string | null;
  selected_draft_id: string | null;
  recipient_name: string | null;
  recipient_title: string | null;
  recipient_email: string | null;
  recipient_webset_id: string | null;
  recipient_webset_item_id: string | null;
  applied_manually: boolean;
  gmail_thread_id: string | null;
  gmail_message_id: string | null;
  sent_at: string | null;
  enrichment_attempts: number;
  max_enrichment_attempts: number;
  processing_started_at: string | null;
  attempt_count: number;
  last_error: string | null;
  job_posted_at: string | null;
  discovered_at: string;
  updated_at: string;
}

export interface WatchlistRow {
  id: string;
  user_id: string;
  company_name: string;
  source: "auto" | "manual";
  webset_id: string | null;
  last_alert_at: string | null;
  created_at: string;
}

export type WatchlistAlertType =
  | "funding"
  | "hire"
  | "launch"
  | "press"
  | "job_posting"
  | "leadership_change";

export interface WatchlistAlertRow {
  id: string;
  watchlist_id: string;
  alert_type: WatchlistAlertType;
  title: string;
  summary: string | null;
  source_url: string | null;
  source_item_id: string;
  detected_at: string;
}

// ---------------------------------------------------------------------------
// Onboarding Interviews (Phase 10)
// ---------------------------------------------------------------------------

export type OnboardingInterviewStatus =
  | "in_progress"
  | "extracting"
  | "review"
  | "confirmed"
  | "abandoned";

export interface OnboardingInterviewRow {
  id: string;
  user_id: string;
  messages: unknown[];
  status: OnboardingInterviewStatus;
  ready_for_extraction: boolean;
  extracted_profile: Record<string, unknown> | null;
  extracted_search: Record<string, unknown> | null;
  extracted_outreach: Record<string, unknown> | null;
  extracted_insights: Record<string, unknown> | null;
  topics_covered: string[];
  is_refresh: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Scoring Profile (Phase 9)
// ---------------------------------------------------------------------------

export interface UserScoringProfileRow {
  id: string;
  user_id: string;

  // Layer 1: Stable rubric (derived)
  role_fit_keywords: string[];
  seniority_years: number | null;
  preferred_stages: string[];
  preferred_domains: string[];
  tool_familiarity: string[];
  proof_points: Array<{ text: string }>;
  dealbreaker_patterns: string[];

  // Layer 2: Dimension weights (0.5–2.0)
  weight_role_fit: number;
  weight_seniority: number;
  weight_stage: number;
  weight_domain: number;
  weight_stack: number;
  weight_proof_points: number;
  weight_dealbreaker: number;

  // Layer 2: Structured preferences
  target_roles: string[];
  target_locations: string[];
  green_flags: string[];
  red_flags: string[];

  created_at: string;
  updated_at: string;
}
