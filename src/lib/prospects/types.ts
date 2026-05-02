export type ProspectSource = "yt_comments";

export type ProspectStatus =
  | "discovered"
  | "scored"
  | "filtered"
  | "promoted"
  | "dismissed";

export type CompanyConfidence = "none" | "low" | "medium" | "high";

export interface ProspectRow {
  id: string;
  user_id: string;
  source: ProspectSource;
  external_id: string;
  video_icp_review_id: string | null;
  display_name: string;
  youtube_author_id: string | null;
  youtube_comment_id: string | null;
  youtube_channel_url: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_confidence: CompanyConfidence;
  comment_text: string;
  comment_like_count: number | null;
  comment_timestamp_sec: number | null;
  evidence: Record<string, unknown>;
  status: ProspectStatus;
  score: number | null;
  score_components: Record<string, unknown> | null;
  analysis_id: string | null;
  last_error: string | null;
  discovered_at: string;
  created_at: string;
  updated_at: string;
}
