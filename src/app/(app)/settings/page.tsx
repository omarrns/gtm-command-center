import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { UserScoringProfileRow, UserType } from "@/lib/supabase/types";
import { SettingsClient } from "./_components/settings-client";

export default async function SettingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const searchParams = await props.searchParams;

  // Load pipeline config
  const { data: config } = await svc
    .from("pipeline_config")
    .select(
      "score_threshold, daily_send_cap, gmail_send_address, search_queries, search_locations",
    )
    .eq("user_id", user.id)
    .single();

  // Load scoring profile (may not exist yet)
  const { data: scoringProfile } = await svc
    .from("user_scoring_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // SPEC-3 Phase 6.d: persona drives the switch-persona placeholder.
  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const userType = (profile?.user_type as UserType | null) ?? null;

  // Check Gmail connection status
  const { data: gmailCreds } = await svc
    .from("gmail_credentials")
    .select("id, granted_scopes")
    .eq("user_id", user.id)
    .maybeSingle();

  const gmailConnected =
    searchParams.gmail_connected === "true" || !!gmailCreds;
  const hasGmailBodyAccess =
    gmailCreds?.granted_scopes?.includes(
      "https://www.googleapis.com/auth/gmail.readonly",
    ) ?? false;
  const gmailError =
    typeof searchParams.gmail_error === "string"
      ? searchParams.gmail_error
      : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Pipeline configuration and integrations.
        </p>
      </div>

      <SettingsClient
        gmailConnected={gmailConnected}
        gmailAddress={config?.gmail_send_address ?? null}
        hasGmailBodyAccess={hasGmailBodyAccess}
        gmailError={gmailError}
        scoreThreshold={config?.score_threshold ?? 70}
        dailySendCap={config?.daily_send_cap ?? 10}
        searchQueries={
          (config?.search_queries as string[]) ?? [
            "GTM Engineer",
            "Growth Engineer",
          ]
        }
        searchLocations={
          (config?.search_locations as string[]) ?? [
            "San Francisco",
            "New York",
          ]
        }
        scoringProfile={scoringProfile as unknown as UserScoringProfileRow | null}
        userType={userType}
      />
    </div>
  );
}
