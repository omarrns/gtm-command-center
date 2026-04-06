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
