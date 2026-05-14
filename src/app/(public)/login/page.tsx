import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { BrandLogo } from "@/components/brand-logo";
import { Card } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in · Searchcraft",
};

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const { next, error } = await searchParams;

  return (
    <div className="w-full max-w-md">
      <Card className="gap-0 p-8 shadow-sm">
        <div className="mb-8">
          <BrandLogo className="mb-4" />
          <h1 className="text-3xl font-bold tracking-tight leading-tight">
            Sign in to continue
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Email + password or Google. Invite-only during early access.
          </p>
        </div>
        <LoginForm next={next} error={error} />
      </Card>
    </div>
  );
}
