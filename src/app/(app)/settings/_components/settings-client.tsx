"use client";

import Link from "next/link";
import { FadeIn } from "@/components/ui/fade-in";
import {
  ArrowSquareOut,
  UserCircleGear,
  UserCircle,
} from "@phosphor-icons/react/ssr";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { UserScoringProfileRow, UserType } from "@/lib/supabase/types";
import { SettingsGmailPanel } from "./settings-gmail-panel";
import { SettingsSearchPanel } from "./settings-search-panel";
import { SettingsScoringPanel } from "./settings-scoring-panel";
import { SwitchPersonaPlaceholder } from "./switch-persona-placeholder";

interface SettingsClientProps {
  gmailConnected: boolean;
  gmailAddress: string | null;
  hasGmailBodyAccess: boolean;
  gmailError?: string;
  scoreThreshold: number;
  dailySendCap: number;
  searchQueries: string[];
  searchLocations: string[];
  scoringProfile: UserScoringProfileRow | null;
  userType: UserType | null;
}

export function SettingsClient({
  gmailConnected,
  gmailAddress,
  hasGmailBodyAccess,
  gmailError,
  scoreThreshold,
  dailySendCap,
  searchQueries,
  searchLocations,
  scoringProfile,
  userType,
}: SettingsClientProps) {
  // SPEC-3 polish: hide / reword job_search-specific panels for GTM.
  // The Profile & Outreach card becomes ICP refresh; Gmail / search /
  // scoring panels are entirely job_search-only in v1 and would only
  // confuse a GTM user (no outreach pipeline, no JSearch discovery,
  // no role-fit scoring).
  const isGtm = userType === "gtm";
  const profileTitle = isGtm ? "ICP & positioning" : "Profile & Outreach";
  const profileDescription = isGtm
    ? "Refresh your ICP rubric, exemplars, and product positioning. Discovery + outreach surfaces ship in a follow-up release."
    : "Update your profile, positioning, and outreach preferences. Changes take effect on the next pipeline run.";
  const profileHref = isGtm
    ? "/onboard?mode=refresh&template=icp_definition"
    : "/onboard?mode=refresh";
  const profileLinkLabel = isGtm ? "Refresh ICP" : "Edit Profile";

  return (
    <FadeIn className="space-y-6">
      {gmailError && (
        <div className="rounded-lg border border-[var(--color-danger)] bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-[var(--color-danger)]">
          Gmail connection failed: {gmailError.replace(/_/g, " ")}
        </div>
      )}

      <Card className="gap-3 p-5">
        <div className="flex items-center gap-2">
          <UserCircleGear size={16} />
          <h2 className="text-sm font-semibold">{profileTitle}</h2>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          {profileDescription}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={profileHref}
            className={buttonVariants({ variant: "ghost" })}
          >
            <ArrowSquareOut size={13} />
            {profileLinkLabel}
          </Link>
          {!isGtm && (
            <Link
              href="/profile"
              className={buttonVariants({ variant: "outline" })}
            >
              <UserCircle size={13} />
              View Profile
            </Link>
          )}
        </div>
      </Card>

      {!isGtm && (
        <>
          <SettingsGmailPanel
            gmailConnected={gmailConnected}
            gmailAddress={gmailAddress}
            hasGmailBodyAccess={hasGmailBodyAccess}
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
        </>
      )}

      <SwitchPersonaPlaceholder userType={userType} />
    </FadeIn>
  );
}
