import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { DraftForm } from "./_components/draft-form";

export default async function MessagingDraftPage() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("user_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profile?.user_type !== "gtm") {
    redirect("/");
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Draft email"
        description="Generate a story-grounded cold email for any buyer using your ICP narrative arc."
      />
      <DraftForm />
    </div>
  );
}
