import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { AppShell } from "@/components/app-shell";
import type { UserType } from "@/lib/supabase/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  // SPEC-3 Phase 6.c: persona drives sidebar nav vocabulary. Loaded
  // here in the RSC layout so SidebarNav (client) renders against
  // the right persona on first paint without a client-side fetch.
  const svc = createSupabaseServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();
  const userType = (profile?.user_type as UserType | null) ?? null;

  return (
    <AppShell user={{ email: user.email ?? "" }} userType={userType}>
      {children}
    </AppShell>
  );
}
