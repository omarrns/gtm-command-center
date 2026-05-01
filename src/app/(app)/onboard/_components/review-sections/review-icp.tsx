"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { backToInterviewAction } from "../../interview-actions";
import { startIcpNarrativeAction } from "../../story-actions";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import { icpEditsSchema, type IcpEdits } from "@/lib/onboarding/icp-schemas";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";
import { detectIcpDisagreements } from "@/lib/onboarding/orchestrator/icp-disagreements";
import { DeclaredIcp } from "./icp/declared-icp";
import { InferredFromExemplars } from "./icp/inferred-from-exemplars";
import { CommonPatterns } from "./icp/common-patterns";
import { Exclusions } from "./icp/exclusions";
import { Disagreements } from "./icp/disagreements";
import { ScoringPreview } from "./icp/scoring-preview";
import { PerExemplarBreakdown } from "./icp/per-exemplar-breakdown";
import { ExemplarScarcityBanner } from "./icp/exemplar-scarcity-banner";
import { ProofPointsCalibration } from "./icp/proof-points-calibration";

// SPEC-3 Phase 5.a: ICP review UI. Replaces the Phase 1.e stub. Eight
// synthesis + comparison sections, each in its own file under
// _components/review-sections/icp/. The orchestrator's run already
// wrote the unified `extracted` JSONB; we hydrate the form from there
// and let the user tune leaves before confirm.
//
const EMPTY_EDITS: IcpEdits = {
  product: { category: "", core_jtbd: "", wedge: "", delivery_model: "" },
  icp: {
    buyer: { economic_buyer: "", champion: "", end_user: "", deal_blocker: "" },
    firmographics: {
      industries: [],
      business_model: "",
      employee_range: { min: 0, max: 10000 },
      stages: [],
      geographies: [],
    },
    technographics: {
      required_tools: [],
      excluded_tools: [],
      tech_maturity: "",
      data_infrastructure: "",
    },
    signals: {
      hiring_roles: [],
      jtbd_evidence: [],
      trigger_events: [],
      pain_language: [],
    },
    disqualifiers: {
      tech_disqualifiers: [],
      size_disqualifiers: "",
      stage_disqualifiers: [],
      behavioral_disqualifiers: [],
    },
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
  onBackToInterview: (interview: OnboardingInterviewRow) => void;
  onContinueToStory: (interview: OnboardingInterviewRow) => void;
}

export function ReviewIcp({
  interview,
  onBackToInterview,
  onContinueToStory,
}: ReviewIcpProps) {
  const [isPending, startTransition] = useTransition();

  const orchestratorState =
    (interview.orchestrator_state as OrchestratorState | null) ?? null;
  const positiveExemplarCount = countSucceededPositives(orchestratorState);

  const parsedInitialEdits = icpEditsSchema.safeParse(interview.extracted);
  const initialEdits = parsedInitialEdits.success
    ? parsedInitialEdits.data
    : EMPTY_EDITS;
  const [edits, setEdits] = useState<IcpEdits>(initialEdits);

  const disagreements = useMemo(
    () => detectIcpDisagreements(orchestratorState),
    [orchestratorState],
  );

  function handleContinueToStory() {
    startTransition(async () => {
      const result = await startIcpNarrativeAction(interview.id, edits);
      if (!result.ok) {
        toast.error(result.error ?? "Could not start narrative arc");
        return;
      }
      onContinueToStory(result.interview);
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-3xl px-6 pb-12"
    >
      <header className="sticky top-0 z-20 -mx-6 mb-8 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-6 py-4 backdrop-blur">
        <div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Review your ICP
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--color-text-muted)]">
              Synthesized from your exemplars, buyer personas, and product
              context. Edit anything that doesn&apos;t look right, then
              I&apos;ll write you the arc.
            </p>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
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
            <Button
              type="button"
              size="sm"
              onClick={handleContinueToStory}
              disabled={isPending}
            >
              {isPending ? "Starting..." : "Continue to narrative arc"}
            </Button>
          </div>
        </div>
      </header>

      <ExemplarScarcityBanner positiveExemplarCount={positiveExemplarCount} />

      <DeclaredIcp
        product={edits.product}
        onProductChange={(product) => setEdits({ ...edits, product })}
        buyer={edits.icp.buyer}
        onBuyerChange={(buyer) =>
          setEdits({ ...edits, icp: { ...edits.icp, buyer } })
        }
        evidence={edits.evidence}
      />

      <InferredFromExemplars
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
        positiveExemplarCount={positiveExemplarCount}
        evidence={edits.evidence}
      />

      {positiveExemplarCount >= 3 && (
        <CommonPatterns
          orchestratorState={orchestratorState}
          positiveExemplarCount={positiveExemplarCount}
        />
      )}

      <Exclusions
        disqualifiers={edits.icp.disqualifiers}
        onDisqualifiersChange={(disqualifiers) =>
          setEdits({ ...edits, icp: { ...edits.icp, disqualifiers } })
        }
        evidence={edits.evidence}
      />

      <Disagreements disagreements={disagreements} />

      <ProofPointsCalibration
        proofPoints={edits.proof_points}
        onProofPointsChange={(proof_points) =>
          setEdits({ ...edits, proof_points })
        }
      />

      <ScoringPreview edits={edits} />

      <PerExemplarBreakdown orchestratorState={orchestratorState} />

      <div className="mt-12 border-t border-[var(--color-border-strong)]" />
    </motion.div>
  );
}
