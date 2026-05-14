"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueueFilterBar } from "@/components/shared/queue-filter-bar";
import {
  AccountCard,
  type AccountCardProps,
} from "../../../_components/account-card";

type Tier = "A" | "B" | "C";
type Source = "theirstack" | "exa-dormant" | "yt_comments";

interface AccountsListProps {
  cards: AccountCardProps[];
}

export function AccountsList({ cards }: AccountsListProps) {
  const [companySearch, setCompanySearch] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [tierFilter, setTierFilter] = useState<Tier | "">("");
  const [sourceFilter, setSourceFilter] = useState<Source | "">("");

  const min = minScore ? parseInt(minScore, 10) : null;
  const max = maxScore ? parseInt(maxScore, 10) : null;
  const search = companySearch.trim().toLowerCase();

  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (search && !c.companyName.toLowerCase().includes(search)) return false;
      if (min != null && !Number.isNaN(min) && c.score < min) return false;
      if (max != null && !Number.isNaN(max) && c.score > max) return false;
      if (tierFilter && c.tier !== tierFilter) return false;
      if (sourceFilter && c.source !== sourceFilter) return false;
      return true;
    });
  }, [cards, search, min, max, tierFilter, sourceFilter]);

  const hasActiveFilters =
    !!companySearch ||
    !!minScore ||
    !!maxScore ||
    !!tierFilter ||
    !!sourceFilter;

  function resetFilters() {
    setCompanySearch("");
    setMinScore("");
    setMaxScore("");
    setTierFilter("");
    setSourceFilter("");
  }

  return (
    <div className="max-w-[920px]">
      <QueueFilterBar
        idPrefix="accounts"
        companySearch={companySearch}
        onCompanySearchChange={setCompanySearch}
        minScore={minScore}
        onMinScoreChange={setMinScore}
        maxScore={maxScore}
        onMaxScoreChange={setMaxScore}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
        leftSlot={
          <>
            <div>
              <label
                htmlFor="accounts-tier"
                className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
              >
                Tier
              </label>
              <Select
                value={tierFilter || "all"}
                onValueChange={(value) =>
                  setTierFilter(
                    !value || value === "all" ? "" : (value as Tier),
                  )
                }
              >
                <SelectTrigger id="accounts-tier" size="sm" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="A">Tier A</SelectItem>
                  <SelectItem value="B">Tier B</SelectItem>
                  <SelectItem value="C">Tier C</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label
                htmlFor="accounts-source"
                className="text-xs font-medium text-[var(--color-text-muted)] block mb-1"
              >
                Source
              </label>
              <Select
                value={sourceFilter || "all"}
                onValueChange={(value) =>
                  setSourceFilter(
                    !value || value === "all" ? "" : (value as Source),
                  )
                }
              >
                <SelectTrigger
                  id="accounts-source"
                  size="sm"
                  className="text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  <SelectItem value="theirstack">Hiring</SelectItem>
                  <SelectItem value="exa-dormant">Dormant</SelectItem>
                  <SelectItem value="yt_comments">YouTube</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          message="No accounts match these filters"
          hint="Loosen the score range or clear the company search to see more."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((card) => (
            <AccountCard
              key={card.opportunityId ?? card.companyName}
              {...card}
            />
          ))}
        </div>
      )}
    </div>
  );
}
