import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES RLS.
 *
 * Only use inside trusted server code (background workers, admin-gated routes).
 * When writing rows, always include user_id matching the claimed job owner so
 * that regular users see them through their RLS-scoped client.
 */
let testClientFactory: (() => SupabaseClient) | null = null;

export function __setSupabaseServiceClientForTests(
  factory: (() => SupabaseClient) | null,
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot override Supabase service client in production.");
  }
  testClientFactory = factory;
}

export function createSupabaseServiceClient() {
  if (testClientFactory) return testClientFactory();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
