/**
 * One-time import: reads the proven outreach template from notes/template.md
 * into the Supabase `email_drafts` table as a saved reference.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_USER_ID=... npx tsx scripts/import-outreach.ts
 */

import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const userId = process.env.SEED_USER_ID;

if (!url || !key || !userId) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SEED_USER_ID.",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEMPLATE_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "notes",
  "template.md",
);

async function main() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.log("No notes/template.md found. Skipping.");
    return;
  }

  // Check if already imported
  const { data: existing } = await supabase
    .from("email_drafts")
    .select("id, context")
    .eq("user_id", userId);

  const alreadyImported = (existing ?? []).some(
    (d) =>
      d.context &&
      typeof d.context === "object" &&
      (d.context as Record<string, unknown>).is_template === true,
  );

  if (alreadyImported) {
    console.log("  SKIP template (already imported)");
    return;
  }

  const content = fs.readFileSync(TEMPLATE_PATH, "utf8");

  // First line is the subject, rest is body
  const lines = content.split("\n");
  const subject = lines[0].trim();
  const body = lines.slice(1).join("\n").trim();

  const { error } = await supabase.from("email_drafts").insert({
    user_id: userId,
    draft_type: "email-b2b-customer-support",
    company_name: "[Template]",
    recipient_name: "[Founder first name]",
    recipient_title: "CEO",
    subject,
    body,
    variant_index: 0,
    status: "saved",
    context: {
      source: "imported",
      is_template: true,
      file: "notes/template.md",
    },
  });

  if (error) {
    console.error(`  FAILED template: ${error.message}`);
  } else {
    console.log("  OK outreach template");
  }

  console.log("Done.");
}

main().catch(console.error);
