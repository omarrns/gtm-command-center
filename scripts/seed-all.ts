/**
 * Master seed script: resolves the resettable test user's ID from Supabase, then runs
 * all import scripts in order to populate every section of the app.
 *
 * Usage:
 *   npx tsx scripts/seed-all.ts
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (via dotenv)
 * or from environment variables.
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { resolveSeedUserTarget } from "./lib/user-target";

// Load .env.local if present
const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    const v = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check .env.local.",
  );
  process.exit(1);
}

async function main() {
  console.log("=== GTM Command Center — Seed All ===\n");

  // 1. Resolve user ID
  const supabase = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let target;
  try {
    target = await resolveSeedUserTarget(supabase);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const { userId, email } = target;
  console.log(`Resolved ${email} -> ${userId}\n`);

  // 2. Build shared env for child scripts
  const env = {
    ...process.env,
    SUPABASE_URL: url,
    SUPABASE_SERVICE_ROLE_KEY: key,
    SEED_USER_ID: userId,
    SEED_USER_EMAIL: email,
  };

  const scripts = [
    { name: "Memory", script: "import-memory.ts" },
    { name: "Evaluations", script: "import-evaluations.ts" },
    { name: "Research", script: "import-research.ts" },
    { name: "Outreach", script: "import-outreach.ts" },
    { name: "Coaching", script: "import-coaching.ts" },
  ];

  for (const { name, script } of scripts) {
    const scriptPath = path.resolve(__dirname, script);
    if (!fs.existsSync(scriptPath)) {
      console.log(`[${name}] SKIP — ${script} not found`);
      continue;
    }
    console.log(`[${name}] Running ${script}…`);
    try {
      const output = execSync(`npx tsx ${scriptPath}`, {
        env: env as NodeJS.ProcessEnv,
        cwd: path.resolve(__dirname, ".."),
        stdio: "pipe",
        timeout: 60_000,
      });
      console.log(output.toString());
    } catch (err: unknown) {
      const execErr = err as { stdout?: Buffer; stderr?: Buffer };
      console.error(`[${name}] FAILED`);
      if (execErr.stdout) console.error(execErr.stdout.toString());
      if (execErr.stderr) console.error(execErr.stderr.toString());
    }
  }

  console.log("=== Seed complete ===");
}

main().catch(console.error);
