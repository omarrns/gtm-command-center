import { requireUser } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return <AppShell user={{ email: user.email ?? "" }}>{children}</AppShell>;
}
