"use client";

import Link from "next/link";
import { ExternalLink, UserPen } from "lucide-react";
import type { UserScoringProfileRow } from "@/lib/supabase/types";
import { SettingsGmailPanel } from "./settings-gmail-panel";
import { SettingsSearchPanel } from "./settings-search-panel";
import { SettingsScoringPanel } from "./settings-scoring-panel";

interface SettingsClientProps {
  gmailConnected: boolean;
  gmailAddress: string | null;
  gmailError?: string;
  scoreThreshold: number;
  dailySendCap: number;
  searchQueries: string[];
  searchLocations: string[];
  scoringProfile: UserScoringProfileRow | null;
}

export function SettingsClient({
  gmailConnected,
  gmailAddress,
  gmailError,
  scoreThreshold,
  dailySendCap,
  searchQueries,
  searchLocations,
  scoringProfile,
}: SettingsClientProps) {
  return (
    <div className="space-y-6">
      {gmailError && (
        <div className="rounded-lg border border-[var(--color-danger)] bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-[var(--color-danger)]">
          Gmail connection failed: {gmailError.replace(/_/g, " ")}
        </div>
      )}

      <section className="surface p-5 space-y-3">
        <div className="flex items-center gap-2">
          <UserPen size={16} />
          <h2 className="text-sm font-semibold">Profile &amp; Outreach</h2>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Update your profile, positioning, and outreach preferences. Changes
          take effect on the next pipeline run.
        </p>
        <Link
          href="/onboard?mode=refresh"
          className="btn-ghost inline-flex items-center gap-1.5 text-sm"
        >
          <ExternalLink size={13} />
          Edit Profile
        </Link>
      </section>

      <SettingsGmailPanel
        gmailConnected={gmailConnected}
        gmailAddress={gmailAddress}
      />

      <SettingsSearchPanel
        scoreThreshold={scoreThreshold}
        dailySendCap={dailySendCap}
        searchQueries={searchQueries}
        searchLocations={searchLocations}
      />

      {scoringProfile && (
        <SettingsScoringPanel scoringProfile={scoringProfile} />
      )}
    </div>
  );
}
