"use client";

import type { AccountActivationResult } from "@/lib/pipeline/activation-accounts";
import { AccountCard } from "../../_components/account-card";

// Thin wrapper: /activate's preview shape → shared AccountCard props.
// The shared card lives one level up so /accounts and any future queue
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
      tier={result.tier}
      verdict={result.verdict}
      reasonToBelieve={result.reasonToBelieve}
      fundingStage={result.fundingStage}
      employeeCount={result.employeeCount}
      industry={result.industry}
    />
  );
}
