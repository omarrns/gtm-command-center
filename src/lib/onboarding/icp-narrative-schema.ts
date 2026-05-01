import { z } from "zod";

// Shared between server (template story synthesis) and client
// (icp-narrative-reader.tsx). Kept separate from the template module so
// client imports do not pull in server-only template dependencies.
export const icpNarrativeArcSchema = z.object({
  trigger: z.string().default(""),
  failed_workarounds: z.array(z.string()).default([]),
  stakes: z.string().default(""),
  aha: z.array(z.string()).default([]),
  decision_criteria: z.array(z.string()).default([]),
  identity_shift: z.string().default(""),
});

export type IcpNarrativeArc = z.infer<typeof icpNarrativeArcSchema>;
