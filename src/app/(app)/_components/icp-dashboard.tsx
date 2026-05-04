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
import { safeParseIcpRubric, type IcpRubric } from "@/lib/onboarding/icp-schemas";
import type {
  IcpAgentEventRow,
  IcpEvidenceItemRow,
  IcpRevisionCandidateRow,
  IcpRevisionCommitRow,
} from "@/lib/icp-agent/types";
import { IcpDashboardClient } from "./icp-dashboard-client";

const REFRESH_HREF = "/icp?mode=refresh";

interface IcpDashboardProps {
  userId: string;
  initialView?: "chat" | "rubric" | "narrative" | "changes";
}

interface ArtifactSummary {
  id: string;
  kind: string;
  source_label: string | null;
  source_url: string | null;
  status: string;
}

export async function IcpDashboard({
  userId,
  initialView = "chat",
}: IcpDashboardProps) {
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

  const [
    scoringRes,
    artifactsRes,
    configRes,
    narrativeRes,
    commitsRes,
    candidatesRes,
    eventsRes,
    evidenceRes,
  ] = await Promise.all([
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
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", userId)
      .eq("document_key", "icp_narrative_arc")
      .maybeSingle(),
    svc
      .from("icp_revision_commits")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    svc
      .from("icp_revision_candidates")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(25),
    svc
      .from("icp_agent_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    svc
      .from("icp_evidence_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const rawRubric = scoringRes.data?.icp_rubric ?? null;
  const parsedRubric = rawRubric ? safeParseIcpRubric(rawRubric) : null;
  const rubric: IcpRubric | null =
    parsedRubric?.success === true ? parsedRubric.data : null;
  const artifacts = (artifactsRes.data ?? []) as ArtifactSummary[];
  const activationCompleted = !!configRes.data?.activation_completed_at;
  const narrativeArc = narrativeRes.data?.content?.trim() || null;
  const commits = (commitsRes.data ?? []) as IcpRevisionCommitRow[];
  const rejected = (candidatesRes.data ?? []) as IcpRevisionCandidateRow[];
  const evidenceItems = (evidenceRes.data ?? []) as IcpEvidenceItemRow[];
  const events = hydrateEventEvidence(
    (eventsRes.data ?? []) as IcpAgentEventRow[],
    evidenceItems,
  );

  if (!rubric) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
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
      narrativeArc={narrativeArc}
      artifacts={artifacts}
      activationCompleted={activationCompleted}
      commits={commits}
      rejectedCandidates={rejected}
      events={events}
      initialView={initialView}
    />
  );
}

function hydrateEventEvidence(
  events: IcpAgentEventRow[],
  evidenceItems: IcpEvidenceItemRow[],
): IcpAgentEventRow[] {
  const evidenceById = new Map(evidenceItems.map((item) => [item.id, item]));
  return events.map((event) => {
    if (Array.isArray(event.metadata.evidence)) return event;
    const evidence = event.evidence_ids
      .map((id) => evidenceById.get(id))
      .filter((item): item is IcpEvidenceItemRow => Boolean(item))
      .map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.detail,
        target: item.target,
        confidence: item.confidence,
      }));
    if (evidence.length === 0) return event;
    return {
      ...event,
      metadata: {
        ...event.metadata,
        evidence,
      },
    };
  });
}
