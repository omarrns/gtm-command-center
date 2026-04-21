import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = process.argv[2];
  let query = supabase
    .from("onboarding_interviews")
    .select("id, user_id, status, orchestrator_state, created_at")
    .order("created_at", { ascending: false })
    .limit(1);

  if (email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .single();
    if (!profile) {
      console.log(`no profile for ${email}`);
      return;
    }
    console.log(`filtering by ${email} (user_id: ${profile.user_id})`);
    query = query.eq("user_id", profile.user_id);
  }

  const { data } = await query.single();

  if (!data?.orchestrator_state) {
    console.log("no state");
    return;
  }
  console.log("user_id:", data.user_id, "created:", data.created_at);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = data.orchestrator_state as any;
  console.log("interview id:", data.id, "status:", data.status);
  console.log("\nDIMENSIONS:");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [key, dim] of Object.entries<any>(s.dimensions)) {
    const v = dim.value;
    const vType = Array.isArray(v) ? `array[${v.length}]` : typeof v;
    const vPreview =
      typeof v === "string"
        ? JSON.stringify(v.slice(0, 120))
        : Array.isArray(v)
          ? JSON.stringify(v).slice(0, 200)
          : JSON.stringify(v);
    console.log(
      `  ${key}: status=${dim.status} conf=${dim.confidence} type=${vType}`,
    );
    console.log(`    value=${vPreview}`);
  }
  console.log("\nmetrics:", s.metrics);
  console.log("askedDimensionKeys:", s.askedDimensionKeys);
  console.log("activeDimensionKey:", s.activeDimensionKey);
}

main();
