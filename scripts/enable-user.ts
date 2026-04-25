import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const email = process.argv[2];

if (!email) {
  console.error("Usage: tsx scripts/enable-user.ts <email>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers({
    perPage: 1000,
  });
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) {
    console.error(`No auth user with email ${email}`);
    process.exit(1);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, is_enabled")
    .eq("user_id", user.id)
    .single();

  console.log(`auth user: ${user.id}`);
  console.log(`profile before:`, profile);

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, is_enabled: true }, { onConflict: "user_id" });
  if (upsertError) throw upsertError;

  const { data: after } = await supabase
    .from("profiles")
    .select("user_id, is_enabled")
    .eq("user_id", user.id)
    .single();
  console.log(`profile after:`, after);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
