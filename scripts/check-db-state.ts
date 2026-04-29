import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const email = (process.env.SEED_USER_EMAIL ?? "bloomtea@proton.me")
    .trim()
    .toLowerCase();
  console.log("Checking email:", email);

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, user_type, email")
    .eq("email", email)
    .maybeSingle();
  console.log("Profile:", JSON.stringify(profile));

  if (profile?.user_id) {
    const { data: interviews } = await supabase
      .from("onboarding_interviews")
      .select("id, template_id, status")
      .eq("user_id", profile.user_id);
    console.log("Interviews:", JSON.stringify(interviews));
    const { data: memDocs } = await supabase
      .from("memory_documents")
      .select("document_key, origin")
      .eq("user_id", profile.user_id);
    console.log("Memory docs:", JSON.stringify(memDocs));
    const { data: configRow } = await supabase
      .from("pipeline_config")
      .select("id")
      .eq("user_id", profile.user_id)
      .maybeSingle();
    console.log("Pipeline config:", JSON.stringify(configRow));
  }
}

main();
