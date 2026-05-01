"use client";

import { IcpNarrativeReader } from "./icp-narrative-reader";
import type { OnboardingInterviewRow } from "@/lib/supabase/types";
import type { IcpEdits } from "@/lib/onboarding/icp-schemas";
import type { IcpNarrativeArc } from "@/lib/onboarding/icp-narrative-schema";

interface IcpNarrativeClientProps {
  interview: OnboardingInterviewRow;
  isRefresh: boolean;
}

export function IcpNarrativeClient({
  interview,
  isRefresh,
}: IcpNarrativeClientProps) {
  const extracted = (interview.extracted ?? {}) as Record<string, unknown>;
  const persistedArc =
    (extracted.insights as IcpNarrativeArc | undefined) ?? null;

  const reviewEdits: IcpEdits = {
    product: extracted.product as IcpEdits["product"],
    icp: extracted.icp as IcpEdits["icp"],
    proof_points: extracted.proof_points as IcpEdits["proof_points"],
    evidence: extracted.evidence as IcpEdits["evidence"],
  };

  return (
    <IcpNarrativeReader
      interviewId={interview.id}
      reviewEdits={reviewEdits}
      isRefresh={isRefresh}
      initialArc={persistedArc}
    />
  );
}
