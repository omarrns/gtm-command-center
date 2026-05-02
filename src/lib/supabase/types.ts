export type JobStatus = "pending" | "running" | "complete" | "failed";

export type UserType = "job_seeker" | "gtm";

export interface ProfileRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  is_enabled: boolean;
  // Set only at the first successful onboarding confirm. Pre-confirm, the
  // in-progress template lives on onboarding_interviews.template_id
  // exclusively so downstream surfaces don't fork off an unconfirmed
  // choice.
  user_type: UserType | null;
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

export type OutreachEventType = "sent" | "reply_detected" | "manual_outcome" | "no_response_7d";
export interface OutreachEventRow {
  id: string; user_id: string; opportunity_id: string;
  email_draft_id: string | null; event_type: OutreachEventType; source: string;
  metadata: Record<string, unknown>;
  occurred_at: string; created_at: string;
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

export type VideoIcpReviewStatus = "pending" | "running" | "complete" | "failed";

export type VideoIcpCommentsStatus = "not_requested" | "fetched" | "failed";

export interface VideoIcpReviewRow {
  id: string;
  user_id: string;
  job_id: string | null;
  youtube_url: string;
  video_id: string | null;
  video_title: string | null;
  channel_title: string | null;
  duration_sec: number | null;
  status: VideoIcpReviewStatus;
  error: string | null;
  transcript: Record<string, unknown> | null;
  comments: Record<string, unknown>[] | null;
  comments_status: VideoIcpCommentsStatus;
  comments_error: string | null;
  analysis: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

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

// Webset evaluation row preserved verbatim from the Exa Websets API.
// Mirrors the `evaluations[]` shape inside a Webset item — see
// `WebsetItem` in src/lib/pipeline/people-search.ts.
export interface WebsetMatchReason {
  criterion: string;
  reasoning: string;
  satisfied: "yes" | "no" | "unclear";
}

export type OpportunitySource =
  | "jsearch"
  | "exa"
  | "manual"
  | "theirstack"
  | "exa-dormant";

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
  role_title: string | null;
  company_domain: string | null;
  trigger_signals: Record<string, unknown>[] | null;
  buyer_personas: Record<string, unknown>[] | null;
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
  recipient_linkedin_url: string | null;
  recipient_x_url: string | null;
  recipient_picture_url: string | null;
  recipient_location: string | null;
  recipient_match_reasons: WebsetMatchReason[] | null;
  recipient_webset_id: string | null;
  recipient_webset_item_id: string | null;
  alt_recipient_name: string | null;
  alt_recipient_title: string | null;
  alt_recipient_email: string | null;
  alt_recipient_linkedin_url: string | null;
  alt_recipient_x_url: string | null;
  alt_recipient_picture_url: string | null;
  alt_recipient_location: string | null;
  alt_recipient_match_reasons: WebsetMatchReason[] | null;
  alt_recipient_webset_id: string | null;
  alt_recipient_webset_item_id: string | null;
  alt_enrichment_attempts: number;
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
  job_city: string | null;
  job_state: string | null;
  job_is_remote: boolean | null;
  job_employment_type: string | null;
  job_min_salary: number | null;
  job_max_salary: number | null;
  job_salary_currency: string | null;
  job_salary_period: string | null;
  job_required_skills: string[] | null;
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
  | "story_review"
  | "confirmed"
  | "abandoned";

export interface OnboardingInterviewRow {
  id: string;
  user_id: string;
  messages: unknown[];
  status: OnboardingInterviewStatus;
  ready_for_extraction: boolean;
  // Unified extraction payload. Shape is template-specific — readers must
  // validate via the active template's extractionSchema, not a global type.
  extracted: Record<string, unknown> | null;
  topics_covered: string[];
  is_refresh: boolean;
  template_id: string;
  template_version: string;
  orchestrator_state: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Agentic onboarding artifacts (SPEC-2)
// ---------------------------------------------------------------------------

export type OnboardingArtifactSourceType = "url" | "file" | "text";
export type OnboardingArtifactStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed";

export interface OnboardingArtifactRow {
  id: string;
  user_id: string;
  interview_id: string | null;
  kind: string;
  source_type: OnboardingArtifactSourceType;
  source_label: string | null;
  source_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  status: OnboardingArtifactStatus;
  normalized_markdown: string | null;
  error_message: string | null;
  created_from_template_id: string;
  metadata: Record<string, unknown>;
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

  // GTM persona (user_type='gtm') — populated by icp_definition's
  // normalizer in Phase 3. Structured ICP rubric: firmographics,
  // technographics, signals, disqualifiers, proof_points, buyer_personas.
  // NULL for job_seeker rows.
  icp_rubric: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
}
