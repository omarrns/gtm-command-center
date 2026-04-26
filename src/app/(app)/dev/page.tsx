import { cookies } from "next/headers";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireUser } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import {
  resetOnboardingAction,
  setDevTokenAction,
  setUserTypeUnrestricted,
} from "./actions";

export default async function DevPage() {
  const user = await requireUser();
  const cookieStore = await cookies();
  const secret = process.env.DEV_SECRET;

  if (!secret || cookieStore.get("dev_token")?.value !== secret) {
    return (
      <div className="mx-auto max-w-sm space-y-4 p-8">
        <h1 className="text-lg font-semibold">Dev Panel</h1>
        <form action={setDevTokenAction} className="flex gap-2">
          <Input name="pin" type="password" placeholder="PIN" autoFocus />
          <Button type="submit">Unlock</Button>
        </form>
      </div>
    );
  }

  const svc = createSupabaseServiceClient();
  const [profile, config, interview] = await Promise.all([
    svc
      .from("profiles")
      .select("user_type")
      .eq("user_id", user.id)
      .maybeSingle(),
    svc
      .from("pipeline_config")
      .select("activation_completed_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    svc
      .from("onboarding_interviews")
      .select("status, template_id")
      .eq("user_id", user.id)
      .not("status", "in", '("confirmed","abandoned")')
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const state = {
    user_type: profile.data?.user_type ?? null,
    activation_completed_at: config.data?.activation_completed_at ?? null,
    active_interview: interview.data
      ? `${interview.data.template_id} / ${interview.data.status}`
      : null,
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-lg font-semibold">Dev Panel</h1>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Switch persona</h2>
        <div className="flex gap-2">
          <form action={setUserTypeUnrestricted.bind(null, "job_seeker")}>
            <Button type="submit" variant="outline">
              Job Search
            </Button>
          </form>
          <form action={setUserTypeUnrestricted.bind(null, "gtm")}>
            <Button type="submit" variant="outline">
              GTM
            </Button>
          </form>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Reset onboarding</h2>
        <form action={resetOnboardingAction}>
          <Button type="submit" variant="destructive">
            Reset onboarding
          </Button>
        </form>
      </div>

      <Alert>
        <AlertTitle>Current state</AlertTitle>
        <AlertDescription>
          <pre className="text-xs">{JSON.stringify(state, null, 2)}</pre>
        </AlertDescription>
      </Alert>
    </div>
  );
}
