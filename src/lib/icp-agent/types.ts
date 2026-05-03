export type IcpChatSessionStatus =
  | "active"
  | "completed"
  | "distilling"
  | "complete"
  | "failed";

export interface IcpChatSessionRow {
  id: string;
  user_id: string;
  opportunity_id: string | null;
  account_name: string | null;
  account_domain: string | null;
  purpose: string;
  status: IcpChatSessionStatus;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface IcpChatMessageRow {
  id: string;
  session_id: string;
  user_id: string;
  ordinal: number;
  role: "system" | "user" | "assistant";
  content: string;
  message: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface IcpSessionInsightRow {
  id: string;
  session_id: string;
  user_id: string;
  summary: string;
  insights: Record<string, unknown>;
  model: string;
  created_at: string;
}

export type IcpEvidenceType =
  | "account_memory"
  | "messaging_lesson"
  | "icp_calibration"
  | "ignored";

export interface IcpEvidenceItemRow {
  id: string;
  user_id: string;
  session_id: string;
  insight_id: string | null;
  evidence_type: IcpEvidenceType;
  title: string;
  detail: string;
  target: string;
  confidence: number;
  metadata: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

export interface IcpRevisionCandidateRow {
  id: string;
  user_id: string;
  status: "rejected" | "applied";
  target: "rubric" | "narrative";
  title: string;
  reason: string;
  proposed_patch: Record<string, unknown>;
  judge_result: Record<string, unknown>;
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown> | null;
  evidence_ids: string[];
  proposer_model: string;
  judge_model: string;
  confidence: number;
  created_at: string;
  applied_at: string | null;
}

export interface IcpRevisionCommitRow {
  id: string;
  user_id: string;
  candidate_id: string | null;
  rollback_of: string | null;
  target: "rubric" | "narrative" | "rollback";
  title: string;
  reason: string;
  changed_paths: string[];
  before_snapshot: Record<string, unknown>;
  after_snapshot: Record<string, unknown>;
  diff: Record<string, unknown>;
  evidence_ids: string[];
  proposer_model: string | null;
  judge_model: string | null;
  confidence: number;
  created_at: string;
}

export type IcpAgentEventStatus = "started" | "succeeded" | "failed" | "skipped";

export interface IcpAgentEventRow {
  id: string;
  user_id: string;
  job_id: string | null;
  stage: string;
  status: IcpAgentEventStatus;
  message: string | null;
  session_id: string | null;
  insight_id: string | null;
  evidence_ids: string[];
  candidate_id: string | null;
  commit_id: string | null;
  model: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  error: string | null;
  created_at: string;
}
