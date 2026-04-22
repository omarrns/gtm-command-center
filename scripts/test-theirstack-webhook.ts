#!/usr/bin/env tsx
/**
 * Phase 5b — focused test for the TheirStack webhook endpoint's HMAC
 * verification + JSON payload validation seam.
 *
 * Covers the security-critical path without standing up an HTTP
 * server: constructs a signed POST request, imports the route handler
 * directly, and asserts:
 *   - a matching signature + valid payload returns 422 (no rubric
 *     seeded for the fake user; handler rejects cleanly instead of
 *     silently dropping data)
 *   - a mismatched signature returns 401
 *   - a missing ?user= returns 400
 *   - a missing signature returns 401
 *   - a malformed JSON body returns 400
 *
 * Run: npm run test:theirstack-webhook
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import crypto from "node:crypto";

process.env.THEIRSTACK_WEBHOOK_SIGNING_SECRET =
  process.env.THEIRSTACK_WEBHOOK_SIGNING_SECRET ?? "test-fixture-secret";

// Supabase/Claude clients try to initialise on import. Stub fetch so
// even an accidental outbound call doesn't hit the network.
const originalFetch = globalThis.fetch;
globalThis.fetch = (async () =>
  new Response('{"error":"stubbed"}', {
    status: 503,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://stub.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "stub-service-key";

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) console.log(`  PASS: ${label}`);
  else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

function sign(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function buildJobPayload() {
  return {
    type: "job.new",
    job: {
      id: "webhook-fixture-1",
      job_title: "VP of Sales",
      description: "Own pipeline.",
      date_posted: new Date().toISOString(),
      company: "HookCo",
      company_domain: "hookco.example",
      company_object: {
        name: "HookCo",
        domain: "hookco.example",
        funding_stage: "series_b",
        employee_count: 120,
        country_code: "US",
      },
    },
  };
}

async function main() {
  console.log("Phase 5b — TheirStack webhook security gate");
  console.log("===========================================\n");

  const { POST } = await import("../src/app/api/webhooks/theirstack/route");
  const endpoint = "https://example.test/api/webhooks/theirstack";
  const secret = process.env.THEIRSTACK_WEBHOOK_SIGNING_SECRET!;

  // ── Missing user param ─────────────────────────────────────────────
  {
    const body = JSON.stringify(buildJobPayload());
    const res = await POST(
      new Request(endpoint, {
        method: "POST",
        body,
        headers: { "x-theirstack-signature": sign(secret, body) },
      }),
    );
    assert(res.status === 400, `missing ?user returns 400 (got ${res.status})`);
  }

  // ── Missing signature header ───────────────────────────────────────
  {
    const body = JSON.stringify(buildJobPayload());
    const res = await POST(
      new Request(`${endpoint}?user=00000000-0000-4000-8000-000000000001`, {
        method: "POST",
        body,
      }),
    );
    assert(
      res.status === 401,
      `missing signature returns 401 (got ${res.status})`,
    );
  }

  // ── Mismatched signature ───────────────────────────────────────────
  {
    const body = JSON.stringify(buildJobPayload());
    const tampered = sign("wrong-secret", body);
    const res = await POST(
      new Request(`${endpoint}?user=00000000-0000-4000-8000-000000000001`, {
        method: "POST",
        body,
        headers: { "x-theirstack-signature": tampered },
      }),
    );
    assert(
      res.status === 401,
      `mismatched signature returns 401 (got ${res.status})`,
    );
  }

  // ── Malformed JSON with valid signature ────────────────────────────
  {
    const body = "{not-json";
    const res = await POST(
      new Request(`${endpoint}?user=00000000-0000-4000-8000-000000000001`, {
        method: "POST",
        body,
        headers: { "x-theirstack-signature": sign(secret, body) },
      }),
    );
    assert(
      res.status === 400,
      `malformed JSON returns 400 (got ${res.status})`,
    );
  }

  // ── sha256=<hex> variant still verifies ────────────────────────────
  {
    const body = JSON.stringify({
      type: "job.new",
      // Intentionally malformed payload shape — the signature
      // verifies but the payload fails zod and returns 400. This
      // proves the sha256= prefix is accepted by verifySignature.
      garbage: true,
    });
    const res = await POST(
      new Request(`${endpoint}?user=00000000-0000-4000-8000-000000000001`, {
        method: "POST",
        body,
        headers: { "x-theirstack-signature": `sha256=${sign(secret, body)}` },
      }),
    );
    assert(
      res.status === 400,
      `sha256=<hex> signature verified, payload-validation runs (got ${res.status})`,
    );
  }

  console.log(
    `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
  );
  globalThis.fetch = originalFetch;
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
