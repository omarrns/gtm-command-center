"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function setUserTypeAction(target: "gtm" | "job_seeker") {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Dev-only action not available in production");
  }
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({ user_type: target })
    .eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/", "layout");
}
