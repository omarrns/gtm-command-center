import type { User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side Supabase client scoped to the current request's cookies.
 * Use inside Server Components, Server Actions, and Route Handlers.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>,
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — refresh will happen on next RSC render.
          }
        },
      },
    },
  );
}

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (process.env.NODE_ENV === "development") {
    return (
      user ??
      ({
        id: "00000000-0000-0000-0000-000000000000",
        email: "dev@localhost",
      } as User)
    );
  }

  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
    throw new Error("Unreachable");
  }

  // Enforce invite-only: check profiles.is_enabled
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_enabled")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_enabled) {
    // Sign out and redirect — user exists but is not enabled
    await supabase.auth.signOut();
    const { redirect } = await import("next/navigation");
    redirect("/login?error=Account+not+enabled.+Contact+admin+for+access.");
    throw new Error("Unreachable");
  }

  return user;
}
