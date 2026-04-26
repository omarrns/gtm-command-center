"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function setDevTokenAction(formData: FormData) {
  const secret = process.env.DEV_SECRET;
  if (!secret) throw new Error("DEV_SECRET not configured");
  await requireUser();
  const pin = String(formData.get("pin") ?? "");
  if (pin !== secret) return;
  const cookieStore = await cookies();
  cookieStore.set("dev_token", secret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/", "layout");
}

export async function setUserTypeUnrestricted(target: "gtm" | "job_seeker") {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const { error } = await svc
    .from("profiles")
    .update({ user_type: target })
    .eq("user_id", user.id);
  if (error) throw error;
  revalidatePath("/", "layout");
}

export async function resetOnboardingAction() {
  const user = await requireUser();
  const svc = createSupabaseServiceClient();
  const { error: deleteErr } = await svc
    .from("onboarding_interviews")
    .delete()
    .eq("user_id", user.id);
  if (deleteErr) throw deleteErr;
  const { error: configErr } = await svc
    .from("pipeline_config")
    .update({ activation_completed_at: null })
    .eq("user_id", user.id);
  if (configErr) throw configErr;
  revalidatePath("/", "layout");
}
