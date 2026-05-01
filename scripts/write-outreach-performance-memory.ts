#!/usr/bin/env tsx
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import { createSupabaseServiceClient } from "../src/lib/supabase/service";
import { writeOutreachPerformanceMemory } from "../src/lib/outreach/performance-memory";
import { normalizeUserEmail } from "./lib/user-target";

interface OutreachMemoryTarget {
  userId: string;
  email: string | null;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const svc = createSupabaseServiceClient();
  const target = await resolveOutreachMemoryTarget(svc);
  const sinceDays = readPositiveIntEnv("OUTREACH_MEMORY_SINCE_DAYS", 90);
  const limit = readPositiveIntEnv("OUTREACH_MEMORY_LIMIT", 200);

  const result = await writeOutreachPerformanceMemory({
    svc,
    userId: target.userId,
    sinceDays,
    limit,
  });

  console.log("[outreach-memory] wrote feedback_outreach_performance");
  console.log(`[outreach-memory] user=${target.email} (${target.userId})`);
  console.log(`[outreach-memory] events=${result.eventCount}`);
  console.log(
    `[outreach-memory] range=${result.oldestEventAt ?? "none"} to ${result.newestEventAt ?? "none"}`,
  );
}

async function resolveOutreachMemoryTarget(
  svc: ReturnType<typeof createSupabaseServiceClient>,
): Promise<OutreachMemoryTarget> {
  const userId = process.env.OUTREACH_MEMORY_USER_ID?.trim();
  if (userId) {
    const { data, error } = await svc
      .from("profiles")
      .select("email")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Could not fetch profile ${userId}: ${error.message}`);
    return {
      userId,
      email: typeof data?.email === "string" ? normalizeUserEmail(data.email) : null,
    };
  }

  const rawEmail = process.env.OUTREACH_MEMORY_USER_EMAIL?.trim();
  if (!rawEmail) {
    throw new Error(
      "Set OUTREACH_MEMORY_USER_ID or OUTREACH_MEMORY_USER_EMAIL before writing outreach performance memory.",
    );
  }

  const email = normalizeUserEmail(rawEmail);
  const { data, error } = await svc
    .from("profiles")
    .select("user_id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`Could not resolve user ${email}: ${error.message}`);
  if (!data?.user_id) throw new Error(`No profile found for ${email}.`);
  return { userId: data.user_id as string, email };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
