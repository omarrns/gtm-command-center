/**
 * One-time import: reads .claude/CLAUDE.md and ~/.claude/projects/.../memory/*.md
 * into the Supabase `memory_documents` table.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_USER_ID=... npx tsx scripts/import-memory.ts
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

// Workspace root (this repo)
const WORKSPACE = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(WORKSPACE, "..");

// Memory file sources
const CLAUDE_MD = path.join(WORKSPACE_ROOT, ".claude", "CLAUDE.md");
const MEMORY_DIR = path.join(
  process.env.HOME!,
  ".claude",
  "projects",
  "-Users-omarnasser-andrew-gai",
  "memory",
);

interface Doc {
  document_key: string;
  source_path: string;
  title: string;
  origin: string;
  content: string;
  metadata: Record<string, unknown>;
}

async function main() {
  const docs: Doc[] = [];

  // 1. Import CLAUDE.md (the main project context file)
  if (fs.existsSync(CLAUDE_MD)) {
    docs.push({
      document_key: "CLAUDE.md",
      source_path: CLAUDE_MD,
      title: "CLAUDE.md — Project Context",
      origin: "imported",
      content: fs.readFileSync(CLAUDE_MD, "utf8"),
      metadata: { type: "project-context" },
    });
  } else {
    console.warn(`CLAUDE.md not found at ${CLAUDE_MD}`);
  }

  // 2. Import every .md in the memory directory (except MEMORY.md itself)
  if (fs.existsSync(MEMORY_DIR)) {
    for (const file of fs.readdirSync(MEMORY_DIR)) {
      if (!file.endsWith(".md") || file === "MEMORY.md") continue;
      const filePath = path.join(MEMORY_DIR, file);
      const content = fs.readFileSync(filePath, "utf8");
      const key = file.replace(".md", "");
      // Try to extract title from frontmatter
      const nameMatch = content.match(/^---\s[\s\S]*?^name:\s*(.+)/m);
      const title = nameMatch?.[1]?.trim() ?? key;

      docs.push({
        document_key: key,
        source_path: filePath,
        title,
        origin: "imported",
        content,
        metadata: { source_file: file },
      });
    }
  } else {
    console.warn(`Memory dir not found at ${MEMORY_DIR}`);
  }

  console.log(`Found ${docs.length} documents to import.`);

  for (const doc of docs) {
    const { error } = await supabase.from("memory_documents").upsert(
      {
        user_id: userId,
        document_key: doc.document_key,
        source_path: doc.source_path,
        title: doc.title,
        origin: doc.origin,
        content: doc.content,
        metadata: doc.metadata,
      },
      { onConflict: "user_id,document_key" },
    );
    if (error) {
      console.error(`  FAILED ${doc.document_key}: ${error.message}`);
    } else {
      console.log(`  OK ${doc.document_key}`);
    }
  }

  console.log("Done.");
}

main().catch(console.error);
