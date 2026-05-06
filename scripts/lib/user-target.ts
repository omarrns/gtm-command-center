import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_TEST_USER_EMAIL = "demo@example.com";

export const PROTECTED_USER_EMAILS = (
  process.env.PROTECTED_USER_EMAILS ?? ""
)
  .split(",")
  .map(normalizeUserEmail)
  .filter(Boolean);

export type UserTarget = {
  userId: string;
  email: string;
};

export function normalizeUserEmail(email: string): string {
  return email.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

export function assertUnprotectedTargetEmail(email: string): void {
  const normalized = normalizeUserEmail(email);
  if (PROTECTED_USER_EMAILS.includes(normalized)) {
    throw new Error(
      `Refusing to modify protected user ${normalized}. Use ${DEFAULT_TEST_USER_EMAIL} for resettable tests.`,
    );
  }
}

export async function resolveUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const normalized = normalizeUserEmail(email);
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("email", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not resolve user ${normalized}: ${error.message}`);
  }

  return (data?.user_id as string | undefined) ?? null;
}

export async function getProfileEmailByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not fetch profile for ${userId}: ${error.message}`);
  }

  const email = data?.email as string | undefined;
  return email ? normalizeUserEmail(email) : null;
}

export async function resolveDestructiveUserTarget(
  supabase: SupabaseClient,
): Promise<UserTarget> {
  const envUserId = process.env.SEED_USER_ID?.trim();

  if (envUserId) {
    const email = await getProfileEmailByUserId(supabase, envUserId);
    if (!email) {
      throw new Error(
        `No profile found for SEED_USER_ID=${envUserId}. Refusing to continue.`,
      );
    }
    assertUnprotectedTargetEmail(email);
    return { userId: envUserId, email };
  }

  const email = normalizeUserEmail(
    process.env.TEST_USER_EMAIL ??
      process.env.SEED_USER_EMAIL ??
      DEFAULT_TEST_USER_EMAIL,
  );
  assertUnprotectedTargetEmail(email);

  const userId = await resolveUserIdByEmail(supabase, email);
  if (!userId) {
    throw new Error(`No profile found for ${email}. Refusing to continue.`);
  }

  return { userId, email };
}

export async function resolveSeedUserTarget(
  supabase: SupabaseClient,
): Promise<UserTarget> {
  return resolveDestructiveUserTarget(supabase);
}
