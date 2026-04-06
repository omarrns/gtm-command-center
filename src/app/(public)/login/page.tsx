import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in · GTM Command Center",
};

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/analysis");

  const { next, error } = await searchParams;

  return (
    <div className="w-full max-w-md">
      <div className="surface p-8 shadow-sm">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-subtle)] mb-2">
            GTM Command Center
          </div>
          <h1 className="text-2xl font-semibold leading-tight">
            Sign in to continue
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Magic link or Google. Invite-only during early access.
          </p>
        </div>
        <LoginForm next={next} error={error} />
      </div>
    </div>
  );
}
