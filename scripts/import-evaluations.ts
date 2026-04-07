/**
 * One-time import: reads evaluations/INDEX.md and evaluation .md files into
 * the Supabase `analyses` table as pre-seeded results.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_USER_ID=... npx tsx scripts/import-evaluations.ts
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

const EVALUATIONS_DIR = path.resolve(__dirname, "..", "..", "evaluations");

async function main() {
  if (!fs.existsSync(EVALUATIONS_DIR)) {
    console.log("No evaluations/ directory found. Skipping.");
    return;
  }

  // Load existing imported evaluations to avoid duplicates
  const { data: existing } = await supabase
    .from("analyses")
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

  const companies = fs
    .readdirSync(EVALUATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  let imported = 0;

  for (const company of companies) {
    const companyDir = path.join(EVALUATIONS_DIR, company.name);
    const mdFiles = fs.readdirSync(companyDir).filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      const inputFile = `evaluations/${company.name}/${file}`;
      if (existingFiles.has(inputFile)) {
        console.log(`  SKIP ${company.name}/${file} (already imported)`);
        continue;
      }

      const content = fs.readFileSync(path.join(companyDir, file), "utf8");

      // Parse frontmatter
      const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
      const frontmatter: Record<string, string> = {};
      if (fmMatch) {
        for (const line of fmMatch[1].split("\n")) {
          const [k, ...v] = line.split(":");
          if (k && v.length) frontmatter[k.trim()] = v.join(":").trim();
        }
      }

      const companyName = frontmatter.company ?? company.name;
      const roleTitle =
        frontmatter.role ??
        file.replace(/_\d{4}-\d{2}-\d{2}\.md$/, "").replace(/-/g, " ");
      const skillSlug = frontmatter.type ?? "jd-fit-rubric";
      const score = frontmatter.jd_fit_score ?? frontmatter.fit_score ?? null;
      const verdict = frontmatter.verdict ?? null;

      const { error } = await supabase.from("analyses").insert({
        user_id: userId,
        skill_slug: skillSlug,
        company_name: companyName,
        role_title: roleTitle,
        status: "complete",
        input: {
          source: "imported",
          file: `evaluations/${company.name}/${file}`,
        },
        result: {
          imported: true,
          raw_markdown: content,
          score,
          verdict,
        },
      });

      if (error) {
        console.error(`  FAILED ${company.name}/${file}: ${error.message}`);
      } else {
        console.log(`  OK ${company.name}/${file}`);
        imported++;
      }
    }
  }

  console.log(`Imported ${imported} evaluations.`);
}

main().catch(console.error);
