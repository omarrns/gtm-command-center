"use client";

import { Building2, Users, TrendingUp, Globe2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AccountActivationResult } from "@/lib/pipeline/activation-accounts";

interface AccountResultCardProps {
  result: AccountActivationResult;
}

function tierVariant(
  tier: "A" | "B" | "C",
): "default" | "secondary" | "outline" {
  if (tier === "A") return "default";
  if (tier === "B") return "secondary";
  return "outline";
}

function verdictColor(verdict: "Pursue" | "Worth exploring" | "Skip") {
  if (verdict === "Pursue") return "var(--color-success)";
  if (verdict === "Worth exploring") return "var(--color-warning)";
  return "var(--color-text-subtle)";
}

function formatEmployees(n: number | null): string | null {
  if (n == null) return null;
  if (n >= 1000) return `${Math.round(n / 100) / 10}k employees`;
  return `${n} employees`;
}

export function AccountResultCard({ result }: AccountResultCardProps) {
  const {
    companyName,
    companyDomain,
    roleTitle,
    score,
    tier,
    verdict,
    reasonToBelieve,
    fundingStage,
    employeeCount,
    industry,
  } = result;

  return (
    <div className="surface p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{companyName}</h3>
            <Badge variant={tierVariant(tier)}>Tier {tier}</Badge>
          </div>
          {companyDomain && (
            <p className="text-xs text-[var(--color-text-subtle)] truncate">
              {companyDomain}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-base font-semibold tabular-nums">{score}</div>
          <div
            className="text-xs font-medium"
            style={{ color: verdictColor(verdict) }}
          >
            {verdict}
          </div>
        </div>
      </div>

      <p className="text-sm leading-relaxed">{reasonToBelieve}</p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
        <span className="inline-flex items-center gap-1">
          <Building2 size={12} />
          Hiring: {roleTitle}
        </span>
        {fundingStage && (
          <span className="inline-flex items-center gap-1">
            <TrendingUp size={12} />
            {fundingStage}
          </span>
        )}
        {employeeCount != null && (
          <span className="inline-flex items-center gap-1">
            <Users size={12} />
            {formatEmployees(employeeCount)}
          </span>
        )}
        {industry && (
          <span className="inline-flex items-center gap-1">
            <Globe2 size={12} />
            {industry}
          </span>
        )}
      </div>
    </div>
  );
}
