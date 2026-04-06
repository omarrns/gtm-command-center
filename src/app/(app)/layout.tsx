import { requireUser } from "@/lib/supabase/server";
import { SidebarNav } from "@/components/sidebar-nav";
import { TopBar } from "@/components/top-bar";
import { LazyCommandPalette } from "@/components/lazy-command-palette";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="min-h-screen flex">
      <SidebarNav user={{ email: user.email ?? "" }} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-8 py-10">{children}</div>
        </main>
      </div>
      <LazyCommandPalette />
    </div>
  );
}
