export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_calls: {
        Row: {
          call_kind: string
          call_purpose: string | null
          created_at: string
          error: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output_tokens: number | null
          response_object: Json | null
          response_text: string | null
          run_id: string | null
          scope_id: string | null
          scope_table: string | null
          system_prompt: string | null
          total_tokens: number | null
          user_id: string | null
          user_prompt: string | null
        }
        Insert: {
          call_kind: string
          call_purpose?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output_tokens?: number | null
          response_object?: Json | null
          response_text?: string | null
          run_id?: string | null
          scope_id?: string | null
          scope_table?: string | null
          system_prompt?: string | null
          total_tokens?: number | null
          user_id?: string | null
          user_prompt?: string | null
        }
        Update: {
          call_kind?: string
          call_purpose?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output_tokens?: number | null
          response_object?: Json | null
          response_text?: string | null
          run_id?: string | null
          scope_id?: string | null
          scope_table?: string | null
          system_prompt?: string | null
          total_tokens?: number | null
          user_id?: string | null
          user_prompt?: string | null
        }
        Relationships: []
      }
      analyses: {
        Row: {
          company_name: string | null
          created_at: string
          id: string
          input: Json
          job_description: string | null
          job_id: string | null
          result: Json | null
          role_title: string | null
          skill_slug: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          id?: string
          input?: Json
          job_description?: string | null
          job_id?: string | null
          result?: Json | null
          role_title?: string | null
          skill_slug: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          id?: string
          input?: Json
          job_description?: string | null
          job_id?: string | null
          result?: Json | null
          role_title?: string | null
          skill_slug?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyses_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_sessions: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          status: string
          summary: Json | null
          trail_entry: string | null
          transcript: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          status?: string
          summary?: Json | null
          trail_entry?: string | null
          transcript?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          status?: string
          summary?: Json | null
          trail_entry?: string | null
          transcript?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      email_drafts: {
        Row: {
          body: string | null
          company_name: string | null
          context: Json
          created_at: string
          draft_type: string
          id: string
          opportunity_id: string | null
          recipient_name: string | null
          recipient_title: string | null
          source_analysis_id: string | null
          status: string
          subject: string | null
          updated_at: string
          user_id: string
          variant_index: number
        }
        Insert: {
          body?: string | null
          company_name?: string | null
          context?: Json
          created_at?: string
          draft_type: string
          id?: string
          opportunity_id?: string | null
          recipient_name?: string | null
          recipient_title?: string | null
          source_analysis_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id: string
          variant_index?: number
        }
        Update: {
          body?: string | null
          company_name?: string | null
          context?: Json
          created_at?: string
          draft_type?: string
          id?: string
          opportunity_id?: string | null
          recipient_name?: string | null
          recipient_title?: string | null
          source_analysis_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
          user_id?: string
          variant_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_source_analysis_id_fkey"
            columns: ["source_analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_credentials: {
        Row: {
          created_at: string
          encrypted_refresh_token: string
          granted_scopes: string[] | null
          id: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_refresh_token: string
          granted_scopes?: string[] | null
          id?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_refresh_token?: string
          granted_scopes?: string[] | null
          id?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      icp_agent_events: {
        Row: {
          candidate_id: string | null
          commit_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          evidence_ids: string[]
          id: string
          insight_id: string | null
          job_id: string | null
          message: string | null
          metadata: Json
          model: string | null
          session_id: string | null
          stage: string
          status: string
          user_id: string
        }
        Insert: {
          candidate_id?: string | null
          commit_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          evidence_ids?: string[]
          id?: string
          insight_id?: string | null
          job_id?: string | null
          message?: string | null
          metadata?: Json
          model?: string | null
          session_id?: string | null
          stage: string
          status: string
          user_id: string
        }
        Update: {
          candidate_id?: string | null
          commit_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          evidence_ids?: string[]
          id?: string
          insight_id?: string | null
          job_id?: string | null
          message?: string | null
          metadata?: Json
          model?: string | null
          session_id?: string | null
          stage?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_agent_events_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "icp_revision_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icp_agent_events_commit_id_fkey"
            columns: ["commit_id"]
            isOneToOne: false
            referencedRelation: "icp_revision_commits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icp_agent_events_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "icp_session_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icp_agent_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icp_agent_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "icp_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message: Json
          metadata: Json
          ordinal: number
          role: string
          session_id: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          message?: Json
          metadata?: Json
          ordinal: number
          role: string
          session_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message?: Json
          metadata?: Json
          ordinal?: number
          role?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "icp_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_chat_sessions: {
        Row: {
          account_domain: string | null
          account_name: string | null
          completed_at: string | null
          created_at: string
          id: string
          metadata: Json
          opportunity_id: string | null
          purpose: string
          status: string
          summary: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_domain?: string | null
          account_name?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          opportunity_id?: string | null
          purpose?: string
          status?: string
          summary?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_domain?: string | null
          account_name?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          opportunity_id?: string | null
          purpose?: string
          status?: string
          summary?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_chat_sessions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_evidence_items: {
        Row: {
          confidence: number
          created_at: string
          detail: string
          evidence_type: string
          id: string
          insight_id: string | null
          metadata: Json
          processed_at: string | null
          session_id: string
          target: string
          title: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          detail: string
          evidence_type: string
          id?: string
          insight_id?: string | null
          metadata?: Json
          processed_at?: string | null
          session_id: string
          target?: string
          title: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          detail?: string
          evidence_type?: string
          id?: string
          insight_id?: string | null
          metadata?: Json
          processed_at?: string | null
          session_id?: string
          target?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_evidence_items_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "icp_session_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icp_evidence_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "icp_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_revision_candidates: {
        Row: {
          after_snapshot: Json | null
          applied_at: string | null
          before_snapshot: Json
          confidence: number
          created_at: string
          evidence_ids: string[]
          id: string
          judge_model: string
          judge_result: Json
          proposed_patch: Json
          proposer_model: string
          reason: string
          status: string
          target: string
          title: string
          user_id: string
        }
        Insert: {
          after_snapshot?: Json | null
          applied_at?: string | null
          before_snapshot: Json
          confidence?: number
          created_at?: string
          evidence_ids?: string[]
          id?: string
          judge_model: string
          judge_result?: Json
          proposed_patch: Json
          proposer_model: string
          reason: string
          status?: string
          target: string
          title: string
          user_id: string
        }
        Update: {
          after_snapshot?: Json | null
          applied_at?: string | null
          before_snapshot?: Json
          confidence?: number
          created_at?: string
          evidence_ids?: string[]
          id?: string
          judge_model?: string
          judge_result?: Json
          proposed_patch?: Json
          proposer_model?: string
          reason?: string
          status?: string
          target?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      icp_revision_commits: {
        Row: {
          after_snapshot: Json
          before_snapshot: Json
          candidate_id: string | null
          changed_paths: string[]
          confidence: number
          created_at: string
          diff: Json
          evidence_ids: string[]
          id: string
          judge_model: string | null
          proposer_model: string | null
          reason: string
          rollback_of: string | null
          target: string
          title: string
          user_id: string
        }
        Insert: {
          after_snapshot: Json
          before_snapshot: Json
          candidate_id?: string | null
          changed_paths?: string[]
          confidence?: number
          created_at?: string
          diff: Json
          evidence_ids?: string[]
          id?: string
          judge_model?: string | null
          proposer_model?: string | null
          reason: string
          rollback_of?: string | null
          target: string
          title: string
          user_id: string
        }
        Update: {
          after_snapshot?: Json
          before_snapshot?: Json
          candidate_id?: string | null
          changed_paths?: string[]
          confidence?: number
          created_at?: string
          diff?: Json
          evidence_ids?: string[]
          id?: string
          judge_model?: string | null
          proposer_model?: string | null
          reason?: string
          rollback_of?: string | null
          target?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_revision_commits_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "icp_revision_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "icp_revision_commits_rollback_of_fkey"
            columns: ["rollback_of"]
            isOneToOne: false
            referencedRelation: "icp_revision_commits"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_session_insights: {
        Row: {
          created_at: string
          id: string
          insights: Json
          model: string
          session_id: string
          summary: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          insights: Json
          model: string
          session_id: string
          summary: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          insights?: Json
          model?: string
          session_id?: string
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "icp_session_insights_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "icp_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          result: Json | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          result?: Json | null
          status?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_documents: {
        Row: {
          content: string
          created_at: string
          document_key: string
          id: string
          metadata: Json
          origin: string
          source_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          document_key: string
          id?: string
          metadata?: Json
          origin?: string
          source_path?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          document_key?: string
          id?: string
          metadata?: Json
          origin?: string
          source_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_artifacts: {
        Row: {
          created_at: string
          created_from_template_id: string
          error_message: string | null
          file_name: string | null
          id: string
          interview_id: string | null
          kind: string
          metadata: Json
          mime_type: string | null
          normalized_markdown: string | null
          source_label: string | null
          source_type: string
          source_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_from_template_id?: string
          error_message?: string | null
          file_name?: string | null
          id?: string
          interview_id?: string | null
          kind: string
          metadata?: Json
          mime_type?: string | null
          normalized_markdown?: string | null
          source_label?: string | null
          source_type: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_from_template_id?: string
          error_message?: string | null
          file_name?: string | null
          id?: string
          interview_id?: string | null
          kind?: string
          metadata?: Json
          mime_type?: string | null
          normalized_markdown?: string | null
          source_label?: string | null
          source_type?: string
          source_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_artifacts_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "onboarding_interviews"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_interviews: {
        Row: {
          created_at: string
          extracted: Json | null
          id: string
          is_refresh: boolean
          messages: Json
          orchestrator_state: Json | null
          ready_for_extraction: boolean
          status: string
          template_id: string
          template_version: string
          topics_covered: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          extracted?: Json | null
          id?: string
          is_refresh?: boolean
          messages?: Json
          orchestrator_state?: Json | null
          ready_for_extraction?: boolean
          status?: string
          template_id?: string
          template_version?: string
          topics_covered?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          extracted?: Json | null
          id?: string
          is_refresh?: boolean
          messages?: Json
          orchestrator_state?: Json | null
          ready_for_extraction?: boolean
          status?: string
          template_id?: string
          template_version?: string
          topics_covered?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      opportunities: {
        Row: {
          alt_enrichment_attempts: number
          alt_recipient_email: string | null
          alt_recipient_linkedin_url: string | null
          alt_recipient_location: string | null
          alt_recipient_match_reasons: Json | null
          alt_recipient_name: string | null
          alt_recipient_picture_url: string | null
          alt_recipient_title: string | null
          alt_recipient_webset_id: string | null
          alt_recipient_webset_item_id: string | null
          alt_recipient_x_url: string | null
          analysis_id: string | null
          applied_manually: boolean
          attempt_count: number
          buyer_personas: Json | null
          company_domain: string | null
          company_name: string
          discovered_at: string
          enrichment_attempts: number
          external_id: string
          gmail_message_id: string | null
          gmail_thread_id: string | null
          id: string
          job_city: string | null
          job_description: string | null
          job_employment_type: string | null
          job_is_remote: boolean | null
          job_max_salary: number | null
          job_min_salary: number | null
          job_posted_at: string | null
          job_required_skills: string[] | null
          job_salary_currency: string | null
          job_salary_period: string | null
          job_state: string | null
          job_url: string | null
          last_error: string | null
          max_enrichment_attempts: number
          processing_started_at: string | null
          prospect_id: string | null
          recipient_email: string | null
          recipient_linkedin_url: string | null
          recipient_location: string | null
          recipient_match_reasons: Json | null
          recipient_name: string | null
          recipient_picture_url: string | null
          recipient_title: string | null
          recipient_webset_id: string | null
          recipient_webset_item_id: string | null
          recipient_x_url: string | null
          research_id: string | null
          role_title: string | null
          score: number | null
          score_components: Json | null
          selected_draft_id: string | null
          sent_at: string | null
          source: string
          stage: string
          trigger_signals: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alt_enrichment_attempts?: number
          alt_recipient_email?: string | null
          alt_recipient_linkedin_url?: string | null
          alt_recipient_location?: string | null
          alt_recipient_match_reasons?: Json | null
          alt_recipient_name?: string | null
          alt_recipient_picture_url?: string | null
          alt_recipient_title?: string | null
          alt_recipient_webset_id?: string | null
          alt_recipient_webset_item_id?: string | null
          alt_recipient_x_url?: string | null
          analysis_id?: string | null
          applied_manually?: boolean
          attempt_count?: number
          buyer_personas?: Json | null
          company_domain?: string | null
          company_name: string
          discovered_at?: string
          enrichment_attempts?: number
          external_id: string
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          job_city?: string | null
          job_description?: string | null
          job_employment_type?: string | null
          job_is_remote?: boolean | null
          job_max_salary?: number | null
          job_min_salary?: number | null
          job_posted_at?: string | null
          job_required_skills?: string[] | null
          job_salary_currency?: string | null
          job_salary_period?: string | null
          job_state?: string | null
          job_url?: string | null
          last_error?: string | null
          max_enrichment_attempts?: number
          processing_started_at?: string | null
          prospect_id?: string | null
          recipient_email?: string | null
          recipient_linkedin_url?: string | null
          recipient_location?: string | null
          recipient_match_reasons?: Json | null
          recipient_name?: string | null
          recipient_picture_url?: string | null
          recipient_title?: string | null
          recipient_webset_id?: string | null
          recipient_webset_item_id?: string | null
          recipient_x_url?: string | null
          research_id?: string | null
          role_title?: string | null
          score?: number | null
          score_components?: Json | null
          selected_draft_id?: string | null
          sent_at?: string | null
          source: string
          stage?: string
          trigger_signals?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alt_enrichment_attempts?: number
          alt_recipient_email?: string | null
          alt_recipient_linkedin_url?: string | null
          alt_recipient_location?: string | null
          alt_recipient_match_reasons?: Json | null
          alt_recipient_name?: string | null
          alt_recipient_picture_url?: string | null
          alt_recipient_title?: string | null
          alt_recipient_webset_id?: string | null
          alt_recipient_webset_item_id?: string | null
          alt_recipient_x_url?: string | null
          analysis_id?: string | null
          applied_manually?: boolean
          attempt_count?: number
          buyer_personas?: Json | null
          company_domain?: string | null
          company_name?: string
          discovered_at?: string
          enrichment_attempts?: number
          external_id?: string
          gmail_message_id?: string | null
          gmail_thread_id?: string | null
          id?: string
          job_city?: string | null
          job_description?: string | null
          job_employment_type?: string | null
          job_is_remote?: boolean | null
          job_max_salary?: number | null
          job_min_salary?: number | null
          job_posted_at?: string | null
          job_required_skills?: string[] | null
          job_salary_currency?: string | null
          job_salary_period?: string | null
          job_state?: string | null
          job_url?: string | null
          last_error?: string | null
          max_enrichment_attempts?: number
          processing_started_at?: string | null
          prospect_id?: string | null
          recipient_email?: string | null
          recipient_linkedin_url?: string | null
          recipient_location?: string | null
          recipient_match_reasons?: Json | null
          recipient_name?: string | null
          recipient_picture_url?: string | null
          recipient_title?: string | null
          recipient_webset_id?: string | null
          recipient_webset_item_id?: string | null
          recipient_x_url?: string | null
          research_id?: string | null
          role_title?: string | null
          score?: number | null
          score_components?: Json | null
          selected_draft_id?: string | null
          sent_at?: string | null
          source?: string
          stage?: string
          trigger_signals?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_research_id_fkey"
            columns: ["research_id"]
            isOneToOne: false
            referencedRelation: "research_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_selected_draft_id_fkey"
            columns: ["selected_draft_id"]
            isOneToOne: false
            referencedRelation: "email_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_events: {
        Row: {
          created_at: string
          email_draft_id: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          opportunity_id: string
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_draft_id?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          opportunity_id: string
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_draft_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          opportunity_id?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_events_email_draft_id_fkey"
            columns: ["email_draft_id"]
            isOneToOne: false
            referencedRelation: "email_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_config: {
        Row: {
          activation_completed_at: string | null
          created_at: string
          daily_send_cap: number
          gmail_send_address: string | null
          id: string
          score_threshold: number
          search_locations: Json
          search_queries: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          activation_completed_at?: string | null
          created_at?: string
          daily_send_cap?: number
          gmail_send_address?: string | null
          id?: string
          score_threshold?: number
          search_locations?: Json
          search_queries?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          activation_completed_at?: string | null
          created_at?: string
          daily_send_cap?: number
          gmail_send_address?: string | null
          id?: string
          score_threshold?: number
          search_locations?: Json
          search_queries?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          is_enabled: boolean
          updated_at: string
          user_id: string
          user_type: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          is_enabled?: boolean
          updated_at?: string
          user_id: string
          user_type?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          is_enabled?: boolean
          updated_at?: string
          user_id?: string
          user_type?: string | null
        }
        Relationships: []
      }
      prospects: {
        Row: {
          analysis_id: string | null
          comment_like_count: number | null
          comment_text: string
          comment_timestamp_sec: number | null
          company_confidence: string
          company_domain: string | null
          company_name: string | null
          created_at: string
          discovered_at: string
          display_name: string
          evidence: Json
          external_id: string
          id: string
          last_error: string | null
          score: number | null
          score_components: Json | null
          source: string
          status: string
          updated_at: string
          user_id: string
          video_icp_review_id: string | null
          youtube_author_id: string | null
          youtube_channel_url: string | null
          youtube_comment_id: string | null
        }
        Insert: {
          analysis_id?: string | null
          comment_like_count?: number | null
          comment_text: string
          comment_timestamp_sec?: number | null
          company_confidence?: string
          company_domain?: string | null
          company_name?: string | null
          created_at?: string
          discovered_at?: string
          display_name: string
          evidence?: Json
          external_id: string
          id?: string
          last_error?: string | null
          score?: number | null
          score_components?: Json | null
          source: string
          status?: string
          updated_at?: string
          user_id: string
          video_icp_review_id?: string | null
          youtube_author_id?: string | null
          youtube_channel_url?: string | null
          youtube_comment_id?: string | null
        }
        Update: {
          analysis_id?: string | null
          comment_like_count?: number | null
          comment_text?: string
          comment_timestamp_sec?: number | null
          company_confidence?: string
          company_domain?: string | null
          company_name?: string | null
          created_at?: string
          discovered_at?: string
          display_name?: string
          evidence?: Json
          external_id?: string
          id?: string
          last_error?: string | null
          score?: number | null
          score_components?: Json | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
          video_icp_review_id?: string | null
          youtube_author_id?: string | null
          youtube_channel_url?: string | null
          youtube_comment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_video_icp_review_id_fkey"
            columns: ["video_icp_review_id"]
            isOneToOne: false
            referencedRelation: "video_icp_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      research_reports: {
        Row: {
          company_name: string
          created_at: string
          id: string
          input: Json
          job_id: string | null
          research_type: string
          result: Json | null
          role_title: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name: string
          created_at?: string
          id?: string
          input?: Json
          job_id?: string | null
          research_type: string
          result?: Json | null
          role_title?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          input?: Json
          job_id?: string | null
          research_type?: string
          result?: Json | null
          role_title?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_scoring_profiles: {
        Row: {
          created_at: string
          dealbreaker_patterns: string[]
          green_flags: string[]
          icp_rubric: Json | null
          id: string
          preferred_domains: string[]
          preferred_stages: string[]
          proof_points: Json
          red_flags: string[]
          role_fit_keywords: string[]
          seniority_years: number | null
          target_locations: string[]
          target_roles: string[]
          tool_familiarity: string[]
          updated_at: string
          user_id: string
          weight_dealbreaker: number
          weight_domain: number
          weight_proof_points: number
          weight_role_fit: number
          weight_seniority: number
          weight_stack: number
          weight_stage: number
        }
        Insert: {
          created_at?: string
          dealbreaker_patterns?: string[]
          green_flags?: string[]
          icp_rubric?: Json | null
          id?: string
          preferred_domains?: string[]
          preferred_stages?: string[]
          proof_points?: Json
          red_flags?: string[]
          role_fit_keywords?: string[]
          seniority_years?: number | null
          target_locations?: string[]
          target_roles?: string[]
          tool_familiarity?: string[]
          updated_at?: string
          user_id: string
          weight_dealbreaker?: number
          weight_domain?: number
          weight_proof_points?: number
          weight_role_fit?: number
          weight_seniority?: number
          weight_stack?: number
          weight_stage?: number
        }
        Update: {
          created_at?: string
          dealbreaker_patterns?: string[]
          green_flags?: string[]
          icp_rubric?: Json | null
          id?: string
          preferred_domains?: string[]
          preferred_stages?: string[]
          proof_points?: Json
          red_flags?: string[]
          role_fit_keywords?: string[]
          seniority_years?: number | null
          target_locations?: string[]
          target_roles?: string[]
          tool_familiarity?: string[]
          updated_at?: string
          user_id?: string
          weight_dealbreaker?: number
          weight_domain?: number
          weight_proof_points?: number
          weight_role_fit?: number
          weight_seniority?: number
          weight_stack?: number
          weight_stage?: number
        }
        Relationships: []
      }
      video_icp_reviews: {
        Row: {
          analysis: Json | null
          channel_title: string | null
          comments: Json | null
          comments_error: string | null
          comments_status: string
          created_at: string
          duration_sec: number | null
          error: string | null
          id: string
          job_id: string | null
          status: string
          transcript: Json | null
          updated_at: string
          user_id: string
          video_id: string | null
          video_title: string | null
          youtube_url: string
        }
        Insert: {
          analysis?: Json | null
          channel_title?: string | null
          comments?: Json | null
          comments_error?: string | null
          comments_status?: string
          created_at?: string
          duration_sec?: number | null
          error?: string | null
          id?: string
          job_id?: string | null
          status?: string
          transcript?: Json | null
          updated_at?: string
          user_id: string
          video_id?: string | null
          video_title?: string | null
          youtube_url: string
        }
        Update: {
          analysis?: Json | null
          channel_title?: string | null
          comments?: Json | null
          comments_error?: string | null
          comments_status?: string
          created_at?: string
          duration_sec?: number | null
          error?: string | null
          id?: string
          job_id?: string | null
          status?: string
          transcript?: Json | null
          updated_at?: string
          user_id?: string
          video_id?: string | null
          video_title?: string | null
          youtube_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_icp_reviews_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          company_name: string
          created_at: string
          id: string
          last_alert_at: string | null
          source: string
          user_id: string
          webset_id: string | null
        }
        Insert: {
          company_name: string
          created_at?: string
          id?: string
          last_alert_at?: string | null
          source?: string
          user_id: string
          webset_id?: string | null
        }
        Update: {
          company_name?: string
          created_at?: string
          id?: string
          last_alert_at?: string | null
          source?: string
          user_id?: string
          webset_id?: string | null
        }
        Relationships: []
      }
      watchlist_alerts: {
        Row: {
          alert_type: string
          detected_at: string
          id: string
          source_item_id: string
          source_url: string | null
          summary: string | null
          title: string
          watchlist_id: string
        }
        Insert: {
          alert_type: string
          detected_at?: string
          id?: string
          source_item_id: string
          source_url?: string | null
          summary?: string | null
          title: string
          watchlist_id: string
        }
        Update: {
          alert_type?: string
          detected_at?: string
          id?: string
          source_item_id?: string
          source_url?: string | null
          summary?: string | null
          title?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_alerts_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlist"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_artifacts: {
        Row: {
          artifact_type: string
          content: string | null
          created_at: string
          id: string
          job_id: string | null
          metadata: Json
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          artifact_type: string
          content?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          artifact_type?: string
          content?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_next_job: {
        Args: { worker_types: string[] }
        Returns: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          result: Json | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_opportunity: {
        Args: { p_id: string; p_user_id: string }
        Returns: boolean
      }
      reserve_send_slot: {
        Args: { p_opportunity_id: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
