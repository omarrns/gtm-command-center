import { notFound } from "next/navigation";
import { createSupabaseServerClient, requireUser } from "@/lib/supabase/server";
import { MemoryEditor } from "./memory-editor";

export const metadata = { title: "Memory Document · GTM Command Center" };

type Props = { params: Promise<{ documentKey: string }> };

export default async function MemoryDocumentPage({ params }: Props) {
  const { documentKey } = await params;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: doc } = await supabase
    .from("memory_documents")
    .select("*")
    .eq("user_id", user.id)
    .eq("document_key", decodeURIComponent(documentKey))
    .single();

  if (!doc) notFound();

  return <MemoryEditor doc={doc} />;
}
