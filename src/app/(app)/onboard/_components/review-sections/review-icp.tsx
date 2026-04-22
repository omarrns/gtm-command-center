"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  confirmInterviewAction,
  backToInterviewAction,
} from "../../interview-actions";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { ClientInterviewTemplate } from "@/lib/onboarding/templates/types";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";
import { detectIcpDisagreements } from "@/lib/onboarding/orchestrator/icp-disagreements";
import { DeclaredIcp } from "./icp/declared-icp";
import { InferredFromExemplars } from "./icp/inferred-from-exemplars";
import { CommonPatterns } from "./icp/common-patterns";
import { MeaningfulVariations } from "./icp/meaningful-variations";
import { Exclusions } from "./icp/exclusions";
import { Disagreements } from "./icp/disagreements";
import { ScoringPreview } from "./icp/scoring-preview";
import { PerExemplarBreakdown } from "./icp/per-exemplar-breakdown";
import { ExemplarScarcityBanner } from "./icp/exemplar-scarcity-banner";

// SPEC-3 Phase 5.a: ICP review UI. Replaces the Phase 1.e stub. Eight
// synthesis + comparison sections, each in its own file under
// _components/review-sections/icp/. The orchestrator's run already
// wrote the unified `extracted` JSONB; we hydrate the form from there
// and let the user tune leaves before confirm.
//
// No story phase — icp_definition's template lacks an insightsSchema
// so review → confirm goes directly. Routing on success: refresh →
// /settings, first-time → / (Phase 6 will branch on user_type to show
// <IcpDashboard> there).

const EMPTY_EDITS: IcpEdits = {
  product: { category: "", core_jtbd: "", wedge: "" },
  icp: {
    buyer: { economic_buyer: "", champion: "", end_user: "" },
    firmographics: {
      industries: [],
      employee_range_min: 0,
      employee_range_max: 10000,
      stages: [],
      geographies: [],
    },
    technographics: { required_tools: [], excluded_tools: [] },
    signals: { hiring_roles: [], jtbd_evidence: [], trigger_events: [] },
    disqualifiers: [],
  },
  proof_points: {
    existing_customers: [],
    won_deals: [],
    lost_deals_reasons: [],
  },
};

function countSucceededPositives(state: OrchestratorState | null): number {
  if (!state) return 0;
  return state.artifacts.filter(
    (a) => a.kind === "positive_example" && a.status === "succeeded",
  ).length;
}

interface ReviewIcpProps {
  interview: OnboardingInterviewRow;
  clientTemplate: ClientInterviewTemplate;
  isRefresh: boolean;
  onBackToInterview: (interview: OnboardingInterviewRow) => void;
}

export function ReviewIcp({
  interview,
  clientTemplate: _clientTemplate,
  isRefresh,
  onBackToInterview,
}: ReviewIcpProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const orchestratorState =
    (interview.orchestrator_state as OrchestratorState | null) ?? null;
  const positiveExemplarCount = countSucceededPositives(orchestratorState);

  const initialEdits = (interview.extracted as IcpEdits | null) ?? EMPTY_EDITS;
  const [edits, setEdits] = useState<IcpEdits>(initialEdits);

  const disagreements = useMemo(
    () => detectIcpDisagreements(orchestratorState),
    [orchestratorState],
  );

  // Sections collapsed by default except the two edit-heavy ones the
  // user almost always opens (declared + inferred). Read-only sections
  // and per-exemplar breakdown stay collapsed to keep the page short.
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    () => new Set(["declared", "inferred"]),
  );

  function toggleSection(key: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await confirmInterviewAction(interview.id, edits);
      if (!result.ok) {
        toast.error(result.error ?? "Confirmation failed");
        return;
      }
      toast.success("ICP saved!");
      router.push(isRefresh ? "/settings" : "/");
    });
  }

  function handleBack() {
    startTransition(async () => {
      const result = await backToInterviewAction(interview.id);
      if (!result.ok) {
        toast.error(result.error ?? "Failed to resume interview");
        return;
      }
      onBackToInterview({
        ...interview,
        status: "in_progress",
        ready_for_extraction: false,
      });
    });
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Review your ICP</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Synthesized from your exemplars, buyer personas, and product context.
          Edit anything that doesn&apos;t look right, then confirm.
        </p>
      </div>

      <ExemplarScarcityBanner positiveExemplarCount={positiveExemplarCount} />

      <DeclaredIcp
        isExpanded={expandedSections.has("declared")}
        onToggle={() => toggleSection("declared")}
        product={edits.product}
        onProductChange={(product) => setEdits({ ...edits, product })}
        buyer={edits.icp.buyer}
        onBuyerChange={(buyer) =>
          setEdits({ ...edits, icp: { ...edits.icp, buyer } })
        }
      />

      {positiveExemplarCount > 0 && (
        <InferredFromExemplars
          isExpanded={expandedSections.has("inferred")}
          onToggle={() => toggleSection("inferred")}
          firmographics={edits.icp.firmographics}
          onFirmographicsChange={(firmographics) =>
            setEdits({ ...edits, icp: { ...edits.icp, firmographics } })
          }
          technographics={edits.icp.technographics}
          onTechnographicsChange={(technographics) =>
            setEdits({ ...edits, icp: { ...edits.icp, technographics } })
          }
          signals={edits.icp.signals}
          onSignalsChange={(signals) =>
            setEdits({ ...edits, icp: { ...edits.icp, signals } })
          }
          proofPoints={edits.proof_points}
          onProofPointsChange={(proof_points) =>
            setEdits({ ...edits, proof_points })
          }
          positiveExemplarCount={positiveExemplarCount}
        />
      )}

      {positiveExemplarCount >= 3 && (
        <CommonPatterns
          isExpanded={expandedSections.has("common")}
          onToggle={() => toggleSection("common")}
          orchestratorState={orchestratorState}
          positiveExemplarCount={positiveExemplarCount}
        />
      )}

      <MeaningfulVariations
        isExpanded={expandedSections.has("variations")}
        onToggle={() => toggleSection("variations")}
        orchestratorState={orchestratorState}
      />

      <Exclusions
        isExpanded={expandedSections.has("exclusions")}
        onToggle={() => toggleSection("exclusions")}
        disqualifiers={edits.icp.disqualifiers}
        onDisqualifiersChange={(disqualifiers) =>
          setEdits({ ...edits, icp: { ...edits.icp, disqualifiers } })
        }
      />

      <Disagreements
        isExpanded={expandedSections.has("disagreements")}
        onToggle={() => toggleSection("disagreements")}
        disagreements={disagreements}
      />

      <ScoringPreview
        isExpanded={expandedSections.has("scoring")}
        onToggle={() => toggleSection("scoring")}
        edits={edits}
      />

      <PerExemplarBreakdown
        isExpanded={expandedSections.has("breakdown")}
        onToggle={() => toggleSection("breakdown")}
        orchestratorState={orchestratorState}
      />

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleBack}
          disabled={isPending}
        >
          <ArrowLeft size={14} />
          Back to interview
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={isPending}>
          {isPending ? "Saving..." : "Confirm & Continue"}
        </Button>
      </div>
    </div>
  );
}
