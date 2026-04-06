import { notFound } from "next/navigation";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { DraftEditor } from "./draft-editor";

export const metadata = { title: "Draft · GTM Command Center" };

type Props = { params: Promise<{ id: string }> };

export default async function DraftDetailPage({ params }: Props) {
  const [{ id }, user, supabase] = await Promise.all([
    params,
    requireUser(),
    createSupabaseServerClient(),
  ]);

  // Load this draft and any sibling variants (same company + recipient + type + created within 60s)
  const { data: draft } = await supabase
    .from("email_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!draft) notFound();

  // Find sibling variants
  const { data: siblings } = await supabase
    .from("email_drafts")
    .select("*")
    .eq("user_id", user.id)
    .eq("company_name", draft.company_name)
    .eq("recipient_name", draft.recipient_name)
    .eq("draft_type", draft.draft_type)
    .order("variant_index", { ascending: true });

  return (
    <DraftEditor
      drafts={
        (siblings ?? [draft]) as import("@/lib/supabase/types").EmailDraftRow[]
      }
      activeDraftId={id}
    />
  );
}
