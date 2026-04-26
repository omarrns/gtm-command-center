import type { SupabaseClient } from "@supabase/supabase-js";
import { extractSection } from "@/lib/onboarding/markdown";
import { loadMemoryContext } from "@/lib/skills/context";

// Scoring vocabularies — job_search-specific (stage + domain matching).
// Moved here from pipeline/scoring-profile.ts in Phase 1.d so the template
// owns its derived-field logic end to end. ICP's normalizer will have its
// own vocabulary lookup (industry codes, tool categories, etc.).
const STAGE_VOCABULARY = [
  "pre-seed",
  "seed",
  "series-a",
  "series-b",
  "series-c",
  "growth",
  "enterprise",
  "public",
] as const;

const DOMAIN_VOCABULARY = [
  "saas",
  "fintech",
  "devtools",
  "ai-ml",
  "security",
  "healthcare",
  "ecommerce",
  "edtech",
  "martech",
  "customer-ops",
  "infra",
  "data",
] as const;

async function loadPipelineConfig(
  svc: SupabaseClient,
  userId: string,
): Promise<{ search_queries: string[]; search_locations: string[] } | null> {
  const { data } = await svc
    .from("pipeline_config")
    .select("search_queries, search_locations")
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

// Extract total years of experience from career highlights. Looks for year
// ranges and computes the span between earliest and latest.
function extractSeniorityYears(careerHighlights: string): number | null {
  const yearMatches = careerHighlights.match(/\b(19|20)\d{2}\b/g);
  if (!yearMatches || yearMatches.length < 2) return null;
  const years = yearMatches.map(Number);
  const earliest = Math.min(...years);
  const latest = Math.max(...years);
  const span = latest - earliest;
  return span > 0 ? span : null;
}

// Match text against a vocabulary using case-insensitive substring matching.
// Handles range patterns like "Series A-C" → ["series-a", "series-b", "series-c"].
function matchVocabulary(
  text: string,
  vocabulary: readonly string[],
): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched = new Set<string>();

  const rangeMatch = lower.match(
    /series\s+([a-c])\s*[-–—]\s*([a-c])|series\s+([a-c])\s+through\s+([a-c])/,
  );
  if (rangeMatch) {
    const start = (rangeMatch[1] ?? rangeMatch[3]).charCodeAt(0);
    const end = (rangeMatch[2] ?? rangeMatch[4]).charCodeAt(0);
    for (let code = start; code <= end; code++) {
      const stage = `series-${String.fromCharCode(code)}`;
      if ((vocabulary as readonly string[]).includes(stage)) {
        matched.add(stage);
      }
    }
  }

  for (const term of vocabulary) {
    const termVariants = [
      term,
      term.replace(/-/g, " "),
      term.replace(/-/g, "/"),
    ];
    for (const variant of termVariants) {
      if (lower.includes(variant)) {
        matched.add(term);
        break;
      }
    }
  }

  return [...matched];
}

function splitComma(text: string): string[] {
  if (!text) return [];
  return text
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function splitBullets(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\n[-*]|\n\d+\./)
    .map((s) => s.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

export async function normalizeScoringProfile(
  svc: SupabaseClient,
  userId: string,
  // job_search reads from confirmed memory_documents + pipeline_config
  // (already written by the time the normalizer runs in the outputs loop),
  // so the context arg is ignored. ICP needs it because its normalizer
  // reads the in-flight interview row via context.interviewId.
  _context?: { interviewId?: string },
): Promise<void> {
  const [memoryCtx, pipelineConfig] = await Promise.all([
    loadMemoryContext(userId, svc),
    loadPipelineConfig(svc, userId),
  ]);

  const profile = memoryCtx.profile;
  const dealbreakers = memoryCtx.dealbreakers;

  // Layer 1: derived fields.
  const roleFitKeywords = (pipelineConfig?.search_queries ?? []).map(
    (q: string) => q.toLowerCase(),
  );
  const seniorityYears = extractSeniorityYears(
    extractSection(profile, "Career Highlights"),
  );
  const preferredStages = matchVocabulary(
    extractSection(dealbreakers, "Green Flags"),
    STAGE_VOCABULARY,
  );
  const preferredDomains = matchVocabulary(
    [
      extractSection(profile, "Positioning"),
      extractSection(profile, "Career Highlights"),
    ].join(" "),
    DOMAIN_VOCABULARY,
  );
  const toolFamiliarity = splitComma(
    extractSection(profile, "Technical Tools"),
  );
  const proofPoints = splitBullets(
    extractSection(profile, "Top Proof Points"),
  ).map((text) => ({ text }));
  const dealbreakerPatterns = splitBullets(
    extractSection(dealbreakers, "Red Flags"),
  ).map((s) => s.toLowerCase());

  // Layer 2: structured preferences.
  const targetRoles = pipelineConfig?.search_queries ?? [];
  const targetLocations = pipelineConfig?.search_locations ?? [];
  const greenFlags = splitBullets(extractSection(dealbreakers, "Green Flags"));
  const redFlags = splitBullets(extractSection(dealbreakers, "Red Flags"));

  // Upsert derived fields only — preserve weight columns.
  const { error } = await svc.from("user_scoring_profiles").upsert(
    {
      user_id: userId,
      role_fit_keywords: roleFitKeywords,
      seniority_years: seniorityYears,
      preferred_stages: preferredStages,
      preferred_domains: preferredDomains,
      tool_familiarity: toolFamiliarity,
      proof_points: proofPoints,
      dealbreaker_patterns: dealbreakerPatterns,
      target_roles: targetRoles,
      target_locations: targetLocations,
      green_flags: greenFlags,
      red_flags: redFlags,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error(
      `[scoring-profile] normalization failed for user ${userId}:`,
      error.message,
    );
  }
}
