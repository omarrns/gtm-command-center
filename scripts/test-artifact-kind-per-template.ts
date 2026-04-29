#!/usr/bin/env tsx
/**
 * Regression test: per-template artifact-kind contract.
 *
 * Phase 3.b's template-owned contract used to live as hard-coded
 * `templateId === "icp_definition"` branches in ArtifactInput. After the
 * SPEC-3 audit fix each template owns an ArtifactKindContract and
 * ArtifactInput renders from it. If a future template edit changes the
 * mapping silently, this script catches it.
 *
 * Pure TS — no DB, no Supabase, no Claude. Run: `npm run
 * test:artifact-kind-per-template`.
 */

import { getTemplate } from "../src/lib/onboarding/templates";
import {
  defaultFileKind,
  defaultTextKind,
  detectKindFromUrl,
} from "../src/lib/onboarding/templates/artifact-kind";

let failures = 0;
function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
  } else {
    console.error(`  FAIL: ${label}`);
    failures++;
  }
}

function run() {
  // ── job_search ───────────────────────────────────────────────────────────
  console.log("\n--- job_search contract ---\n");
  const jobSearch = getTemplate("job_search");
  const js = jobSearch.artifactKindContract;

  assert(js.defaultTextKind === "pasted_text", "text default = pasted_text");
  assert(
    js.defaultFileKind === "uploaded_file",
    "file default = uploaded_file",
  );
  assert(js.defaultUrlKind === "website", "url default = website");
  assert(
    detectKindFromUrl("https://linkedin.com/in/foo", js) === "linkedin",
    "linkedin URL → linkedin",
  );
  assert(
    detectKindFromUrl("https://WWW.LinkedIn.com/in/foo", js) === "linkedin",
    "linkedin URL (mixed case) → linkedin",
  );
  assert(
    detectKindFromUrl("https://example.com", js) === "website",
    "non-linkedin URL → website",
  );
  assert(
    defaultFileKind(js, "MyResume.pdf") === "resume",
    "filename containing 'resume' → resume",
  );
  assert(
    defaultFileKind(js, "portfolio.pdf") === "uploaded_file",
    "filename without 'resume' → uploaded_file",
  );
  assert(
    defaultTextKind(js) === "pasted_text",
    "pasted text (no override) → pasted_text",
  );
  assert(
    js.kindOptions.includes("linkedin") &&
      js.kindOptions.includes("website") &&
      js.kindOptions.includes("pasted_text") &&
      js.kindOptions.includes("resume") &&
      js.kindOptions.includes("uploaded_file"),
    "kindOptions covers every job_search kind",
  );

  // ── icp_definition ──────────────────────────────────────────────────────
  console.log("\n--- icp_definition contract ---\n");
  const icp = getTemplate("icp_definition");
  const ic = icp.artifactKindContract;

  assert(
    ic.defaultTextKind === "company_context",
    "text default = company_context",
  );
  assert(
    ic.defaultFileKind === "company_context",
    "file default = company_context",
  );
  assert(
    ic.defaultUrlKind === "positive_example",
    "url default = positive_example",
  );
  assert(
    detectKindFromUrl("https://linkedin.com/in/jane-buyer", ic) ===
      "buyer_persona",
    "linkedin profile URL → buyer_persona",
  );
  assert(
    detectKindFromUrl("https://linkedin.com/company/acme", ic) ===
      "positive_example",
    "linkedin *company* URL → positive_example (not buyer_persona)",
  );
  assert(
    detectKindFromUrl("https://customer-alpha.com", ic) === "positive_example",
    "generic customer URL → positive_example",
  );
  assert(
    defaultFileKind(ic, "product-deck.pdf") === "company_context",
    "icp file upload → company_context",
  );
  assert(
    defaultFileKind(ic, "MyResume.pdf") === "company_context",
    "filename containing 'resume' does NOT match on icp (no resume matcher)",
  );
  assert(
    defaultTextKind(ic) === "company_context",
    "pasted text → company_context",
  );
  assert(
    ic.kindOptions.includes("positive_example") &&
      ic.kindOptions.includes("negative_example") &&
      ic.kindOptions.includes("buyer_persona") &&
      ic.kindOptions.includes("company_context"),
    "kindOptions covers every icp_definition kind",
  );
}

run();
console.log(
  `\n${failures === 0 ? "All assertions passed!" : `${failures} assertion(s) FAILED`}`,
);
if (failures > 0) process.exit(1);
