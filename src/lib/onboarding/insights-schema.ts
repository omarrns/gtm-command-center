import { z } from "zod";

// Shared between server (template extraction + story stream route) and
// client (story-reader.tsx via useObject). Lifted out of job-search.ts so
// importing the schema doesn't pull server-only deps onto the client.
export const insightsSchema = z.object({
  career_narrative: z.string().default(""),
  decision_drivers: z.array(z.string()).default([]),
  unstated_preferences: z.array(z.string()).default([]),
  strongest_stories: z.array(z.string()).default([]),
  positioning_alternatives: z.array(z.string()).default([]),
  risk_tolerance: z.string().default(""),
  communication_style_notes: z.string().default(""),
});

export type ExtractionInsights = z.infer<typeof insightsSchema>;
