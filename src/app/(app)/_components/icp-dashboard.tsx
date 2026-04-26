// SPEC-3 Phase 6.a: GTM post-confirm surface. Thin RSC that fetches the
// rubric + exemplar artifacts and hands off to IcpDashboardClient for the
// editable document-style render.
//
// Source of truth for all field values is user_scoring_profiles.icp_rubric.
// Inline edits on the client write back via updateIcpRubricAction.

import Link from "next/link";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { IcpDashboardClient } from "./icp-dashboard-client";

const REFRESH_HREF = "/onboard?mode=refresh&template=icp_definition";

interface IcpDashboardProps {
  userId: string;
}

interface ArtifactSummary {
  id: string;
  kind: string;
  source_label: string | null;
  source_url: string | null;
  status: string;
}

interface IcpRubric {
  product?: {
    category?: string;
    core_jtbd?: string;
    wedge?: string;
  };
  buyer?: {
    economic_buyer?: string;
    champion?: string;
    end_user?: string;
  };
  firmographics?: {
    industries?: string[];
    employee_range_min?: number;
    employee_range_max?: number;
    stages?: string[];
    geographies?: string[];
  };
  technographics?: {
    required_tools?: string[];
    excluded_tools?: string[];
  };
  signals?: {
    hiring_roles?: string[];
    jtbd_evidence?: string[];
    trigger_events?: string[];
  };
  disqualifiers?: string[];
  proof_points?: {
    existing_customers?: string[];
    won_deals?: string[];
    lost_deals_reasons?: string[];
  };
}

export async function IcpDashboard({ userId }: IcpDashboardProps) {
  const svc = createSupabaseServiceClient();

  const { data: confirmedInterview } = await svc
    .from("onboarding_interviews")
    .select("id")
    .eq("user_id", userId)
    .eq("template_id", "icp_definition")
    .eq("status", "confirmed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [scoringRes, artifactsRes, configRes] = await Promise.all([
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", userId)
      .maybeSingle(),
    confirmedInterview
      ? svc
          .from("onboarding_artifacts")
          .select("id, kind, source_label, source_url, status")
          .eq("interview_id", confirmedInterview.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as ArtifactSummary[] }),
    svc
      .from("pipeline_config")
      .select("activation_completed_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const rubric = (scoringRes.data?.icp_rubric as IcpRubric | null) ?? null;
  const artifacts = (artifactsRes.data ?? []) as ArtifactSummary[];
  const activationCompleted = !!configRes.data?.activation_completed_at;

  if (!rubric) {
    return (
      <div className="mx-auto max-w-xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-xl font-semibold tracking-tight">Your ICP</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2">
            Synthesized from your exemplars, buyer personas, and product
            context.
          </p>
        </header>
        <EmptyState
          message="Your ICP rubric isn't ready yet"
          hint="Finish onboarding to synthesize the rubric from your exemplars."
        >
          <Link href={REFRESH_HREF} className={buttonVariants()}>
            Set up your ICP
          </Link>
        </EmptyState>
      </div>
    );
  }

  return (
    <IcpDashboardClient
      initialRubric={rubric}
      artifacts={artifacts}
      activationCompleted={activationCompleted}
    />
  );
}
