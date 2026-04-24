/**
 * Set the same password for every existing Supabase auth user.
 *
 * Usage: npx tsx scripts/set-user-passwords.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const PASSWORD = "12qwaszx";

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const perPage = 1000;
  let page = 1;
  let total = 0;
  let updated = 0;
  const failures: Array<{ id: string; email?: string; error: string }> = [];

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;

    const users = data.users;
    if (users.length === 0) break;

    for (const user of users) {
      total += 1;
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: PASSWORD },
      );
      if (updateError) {
        failures.push({
          id: user.id,
          email: user.email ?? undefined,
          error: updateError.message,
        });
        console.error(`FAIL ${user.email ?? user.id}: ${updateError.message}`);
      } else {
        updated += 1;
        console.log(`OK   ${user.email ?? user.id}`);
      }
    }

    if (users.length < perPage) break;
    page += 1;
  }

  console.log(`\nDone. ${updated}/${total} users updated.`);
  if (failures.length > 0) {
    console.log(`Failures: ${failures.length}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
