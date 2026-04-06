import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { OutreachForm } from "../_components/outreach-form";

export const metadata = { title: "New Outreach · GTM Command Center" };

type SearchParams = Promise<{ analysis?: string }>;

export default async function NewOutreachPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { analysis: analysisId } = await searchParams;
  const user = await requireUser();

  // Pre-fill from linked analysis
  let prefill: {
    companyName?: string;
    roleTitle?: string;
    analysisId?: string;
  } = {};

  if (analysisId) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("analyses")
      .select("company_name, role_title")
      .eq("id", analysisId)
      .eq("user_id", user.id)
      .single();
    if (data) {
      prefill = {
        companyName: data.company_name ?? undefined,
        roleTitle: data.role_title ?? undefined,
        analysisId,
      };
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">New Outreach Draft</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Choose the email type, enter recipient details, and generate draft
          variants in Omar&apos;s voice.
        </p>
      </div>
      <OutreachForm prefill={prefill} />
    </div>
  );
}
