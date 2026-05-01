/**
 * Central Vercel AI Gateway model-id registry.
 *
 * Tier names describe the role in this app, not the provider marketing name.
 * Keep provider/model slugs in this provider-neutral module so call sites do
 * not need to know which vendor backs a routing tier.
 */
export const MODELS = {
  /** Reasoning-tier — deep scoring, orchestration, extraction. */
  opus: "anthropic/claude-opus-4.6",
  /** Pipeline-tier — high-volume batch work, chat, fast scoring. */
  sonnet: "anthropic/claude-sonnet-4.6",
  /** Utility-tier — narrow extraction/classification fallback. */
  haiku: "anthropic/claude-haiku-4.5",
  /** Cheap narrow extraction/classification. */
  tinyExtraction: "google/gemini-2.5-flash-lite",
  /** Human-inspected analysis synthesis. */
  analysisSynthesis: "google/gemini-3-flash",
  /** Video ICP synthetic review primary. */
  videoIcpReview: "google/gemini-3-flash",
  /** Video ICP synthetic review fallback. */
  videoIcpReviewFallback: "anthropic/claude-sonnet-4.6",
  /** Buyer narrative synthesis candidate. */
  deepseekNarrative: "deepseek/deepseek-v4-pro",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];
