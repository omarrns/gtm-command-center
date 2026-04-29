/**
 * One-time import: reads research/*.md files into
 * the Supabase `research_reports` table.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_USER_ID=... npx tsx scripts/import-research.ts
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

const RESEARCH_DIR = path.resolve(__dirname, "..", "..", "research");

const FILE_MAP: Array<{
  file: string;
  company_name: string;
  role_title: string | null;
  research_type: string;
}> = [
  {
    file: "deep-research-report.md",
    company_name: "Pylon",
    role_title: "GTM Engineer",
    research_type: "people-research",
  },
  {
    file: "deep-research-report-2.md",
    company_name: "B2B AI Agents (Market)",
    role_title: "GTM Roles",
    research_type: "market-research",
  },
  {
    file: "inkeep-competitors.md",
    company_name: "Inkeep",
    role_title: null,
    research_type: "competitive-analysis",
  },
  {
    file: "B2B_Support.md",
    company_name: "B2B Support Landscape",
    role_title: null,
    research_type: "market-research",
  },
  {
    file: "synthesis_and_questions.md",
    company_name: "Pylon",
    role_title: "GTM Engineer",
    research_type: "synthesis",
  },
  {
    file: "socratic-session_2026-03-25.md",
    company_name: "Career Reflection",
    role_title: null,
    research_type: "career-reflection",
  },
];

async function main() {
  if (!fs.existsSync(RESEARCH_DIR)) {
    console.log("No research/ directory found. Skipping.");
    return;
  }

  // Check for existing imported reports to avoid duplicates
  const { data: existing } = await supabase
    .from("research_reports")
    .select("id, input")
    .eq("user_id", userId);

  const existingFiles = new Set(
    (existing ?? [])
      .filter(
        (r) =>
          r.input &&
          typeof r.input === "object" &&
          (r.input as Record<string, unknown>).source === "imported",
      )
      .map((r) => (r.input as Record<string, unknown>).file as string),
  );

  let imported = 0;

  for (const entry of FILE_MAP) {
    const filePath = path.join(RESEARCH_DIR, entry.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`  SKIP ${entry.file} (not found)`);
      continue;
    }

    const inputFile = `research/${entry.file}`;
    if (existingFiles.has(inputFile)) {
      console.log(`  SKIP ${entry.file} (already imported)`);
      continue;
    }

    const content = fs.readFileSync(filePath, "utf8");

    const { error } = await supabase.from("research_reports").insert({
      user_id: userId,
      company_name: entry.company_name,
      role_title: entry.role_title,
      research_type: entry.research_type,
      status: "complete",
      input: { source: "imported", file: inputFile },
      result: { imported: true, raw_markdown: content },
    });

    if (error) {
      console.error(`  FAILED ${entry.file}: ${error.message}`);
    } else {
      console.log(`  OK ${entry.file}`);
      imported++;
    }
  }

  console.log(`Imported ${imported} research reports.`);
}

main().catch(console.error);
