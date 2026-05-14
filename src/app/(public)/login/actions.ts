"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

const DEFAULT_SIGN_IN_PATH = "/";

export async function signInWithPasswordAction(
  formData: FormData,
): Promise<{ error?: string; next?: string }> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next =
    String(formData.get("next") ?? DEFAULT_SIGN_IN_PATH) ||
    DEFAULT_SIGN_IN_PATH;
  if (!email) return { error: "Email is required." };
  if (!password) return { error: "Password is required." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  return { next };
}

export async function signInWithGoogleAction(next?: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${getAppUrl()}/auth/callback?next=${encodeURIComponent(
        next ?? DEFAULT_SIGN_IN_PATH,
      )}`,
    },
  });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data.url) redirect(data.url);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
