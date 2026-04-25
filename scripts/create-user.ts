import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: tsx scripts/create-user.ts <email> <password>");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const user = data.user;
  if (!user) throw new Error("No user returned");
  console.log(`created auth user: ${user.id} (${user.email})`);

  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert({ user_id: user.id, is_enabled: true }, { onConflict: "user_id" });
  if (upsertError) throw upsertError;

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, is_enabled")
    .eq("user_id", user.id)
    .single();
  console.log(`profile:`, profile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
