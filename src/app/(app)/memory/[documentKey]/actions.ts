"use server";

import { requireUser, createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveMemoryDocumentAction(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "");
  const content = String(formData.get("content") ?? "");

  if (!id) return { error: "Document ID required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("memory_documents")
    .update({ title, content })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { saved: true };
}
