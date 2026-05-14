"use client";

import type { AccountActivationResult } from "@/lib/pipeline/activation-accounts";
import { AccountCard } from "../../../_components/account-card";

// Thin wrapper: activation preview shape → shared AccountCard props.
// The shared card stays in the legacy app bucket so /gtm/accounts and activation
// surface render identical visuals.

interface AccountResultCardProps {
  result: AccountActivationResult;
}

export function AccountResultCard({ result }: AccountResultCardProps) {
  return (
    <AccountCard
      companyName={result.companyName}
      companyDomain={result.companyDomain}
      roleTitle={result.roleTitle}
      score={result.score}
      stage="scored"
      tier={result.tier}
      verdict={result.verdict}
      reasonToBelieve={result.reasonToBelieve}
      fundingStage={result.fundingStage}
      employeeCount={result.employeeCount}
      industry={result.industry}
    />
  );
}
