/**
 * One-time import: seeds a coaching session from the socratic session transcript
 * and creates the TRAIL memory document.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SEED_USER_ID=... npx tsx scripts/import-coaching.ts
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

const SOCRATIC_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "research",
  "socratic-session_2026-03-25.md",
);

const TRAIL_CONTENT = `## 2026-03-25 — Socratic Self-Reflection Session
Clarified career thesis: "LLMs finally make it possible to give every operator situational awareness that used to require an intelligence team." Identified decision-relevance taste as unfair angle — lived on both sides of the data-to-decision gap (investor consuming intelligence + builder producing it). Established target company criteria: fragmented intelligence problem, technical GTM motion, AI-native or AI-adjacent.

Key insight: the throughline from Clio (2019) to 500 Global to Inkeep has always been the same architecture — unstructured data → structured intelligence → decision-ready output. The tools got more powerful (manual → GPT-4 API → Claude SDK + Exa + Firecrawl), but the thesis never changed.

Dealbreakers identified: no "marketing manager" title, no non-technical GTM, no companies without real data/intelligence problems to solve.`;

async function main() {
  let seeded = 0;

  // 1. Upsert TRAIL memory document
  const { error: trailErr } = await supabase.from("memory_documents").upsert(
    {
      user_id: userId,
      document_key: "TRAIL",
      source_path: "seeded",
      title: "TRAIL — Career Journal",
      origin: "imported",
      content: TRAIL_CONTENT,
      metadata: { type: "trail" },
    },
    { onConflict: "user_id,document_key" },
  );

  if (trailErr) {
    console.error(`  FAILED TRAIL document: ${trailErr.message}`);
  } else {
    console.log("  OK TRAIL memory document");
    seeded++;
  }

  // 2. Seed coaching session from socratic transcript
  // Check if already imported
  const { data: existing } = await supabase
    .from("coaching_sessions")
    .select("id, transcript")
    .eq("user_id", userId)
    .eq("status", "complete");

  const alreadyImported = (existing ?? []).some(
    (s) =>
      s.transcript &&
      typeof s.transcript === "object" &&
      (s.transcript as Record<string, unknown>).source === "imported",
  );

  if (alreadyImported) {
    console.log("  SKIP coaching session (already imported)");
  } else {
    let transcriptContent = "";
    if (fs.existsSync(SOCRATIC_PATH)) {
      transcriptContent = fs.readFileSync(SOCRATIC_PATH, "utf8");
    }

    const { error: sessionErr } = await supabase
      .from("coaching_sessions")
      .insert({
        user_id: userId,
        status: "complete",
        transcript: {
          source: "imported",
          raw: transcriptContent,
        },
        summary: {
          session_title:
            "Socratic Self-Reflection: Career Thesis & Positioning",
          key_insights: [
            "Career thesis: building intelligence systems that give operators situational awareness — same architecture since Clio (2019)",
            "Unfair angle: decision-relevance taste from operating on both sides of the data-to-decision gap",
            "Best work pattern: encounter messy unstructured data problem → instinct to systematize it → build the pipeline → make it decision-ready",
            "The tools evolved (manual → GPT-4 API → Claude SDK + Exa + Firecrawl) but the thesis never changed",
          ],
          next_steps: [
            {
              action:
                "Use 'context enablement' thesis framing in all cold outreach",
              owner: "Omar",
            },
            {
              action:
                "Lead with Compass story in interviews — it's the hero project",
              owner: "Omar",
            },
            {
              action:
                "Target companies with fragmented intelligence problems, not generic marketing roles",
              owner: "Omar",
            },
          ],
          trail_entry: TRAIL_CONTENT,
        },
        trail_entry: TRAIL_CONTENT,
      });

    if (sessionErr) {
      console.error(`  FAILED coaching session: ${sessionErr.message}`);
    } else {
      console.log("  OK coaching session");
      seeded++;
    }
  }

  console.log(`Seeded ${seeded} coaching items.`);
}

main().catch(console.error);
