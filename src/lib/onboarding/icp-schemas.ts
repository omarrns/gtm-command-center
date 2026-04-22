// SPEC-3 Phase 3.b: zod schemas for the icp_definition template.
//
// Split out of templates/icp-definition.ts to keep that file under the
// 400-line cap. These schemas are also re-usable by the Phase 5 ICP
// Review UI — a client component can import the types without pulling in
// the server-only template module.

import { z } from "zod";

// Per-section sub-schemas. Exported individually so the adapter in
// orchestrator/to-confirm-edits.ts can safeParse each orchestrator
// dimension value against the right sub-shape — if the model emits a
// tuple or a differently-keyed object, the safeParse fails and the
// adapter falls back to defaults instead of silently letting a broken
// shape through. Per SPEC-3 audit finding (round 2, #2).

export const buyerSchema = z.object({
  economic_buyer: z.string().default(""),
  champion: z.string().default(""),
  end_user: z.string().default(""),
});

export const firmographicsSchema = z.object({
  industries: z.array(z.string()).default([]),
  employee_range_min: z.number().default(0),
  employee_range_max: z.number().default(10000),
  stages: z.array(z.string()).default([]),
  geographies: z.array(z.string()).default([]),
});

export const technographicsSchema = z.object({
  required_tools: z.array(z.string()).default([]),
  excluded_tools: z.array(z.string()).default([]),
});

export const signalsSchema = z.object({
  hiring_roles: z.array(z.string()).default([]),
  jtbd_evidence: z.array(z.string()).default([]),
  trigger_events: z.array(z.string()).default([]),
});

export const productSchema = z.object({
  category: z.string().default(""),
  core_jtbd: z.string().default(""),
  wedge: z.string().default(""),
});

export const proofPointsSchema = z.object({
  existing_customers: z.array(z.string()).default([]),
  won_deals: z.array(z.string()).default([]),
  lost_deals_reasons: z.array(z.string()).default([]),
});

export const icpExtractionSchema = z.object({
  product: productSchema,
  icp: z.object({
    buyer: buyerSchema,
    firmographics: firmographicsSchema,
    technographics: technographicsSchema,
    signals: signalsSchema,
    disqualifiers: z.array(z.string()).default([]),
  }),
  proof_points: proofPointsSchema,
});

export type IcpExtraction = z.infer<typeof icpExtractionSchema>;

// Edits mirror extraction — reviewer can tune any leaf on the review UI.
// Required (no defaults) so the review screen's form always round-trips a
// complete rubric; the orchestrator + extraction prefill defaults.
export const icpEditsSchema = z.object({
  product: z.object({
    category: z.string(),
    core_jtbd: z.string(),
    wedge: z.string(),
  }),
  icp: z.object({
    buyer: z.object({
      economic_buyer: z.string(),
      champion: z.string(),
      end_user: z.string(),
    }),
    firmographics: z.object({
      industries: z.array(z.string()),
      employee_range_min: z.number(),
      employee_range_max: z.number(),
      stages: z.array(z.string()),
      geographies: z.array(z.string()),
    }),
    technographics: z.object({
      required_tools: z.array(z.string()),
      excluded_tools: z.array(z.string()),
    }),
    signals: z.object({
      hiring_roles: z.array(z.string()),
      jtbd_evidence: z.array(z.string()),
      trigger_events: z.array(z.string()),
    }),
    disqualifiers: z.array(z.string()),
  }),
  proof_points: z.object({
    existing_customers: z.array(z.string()),
    won_deals: z.array(z.string()),
    lost_deals_reasons: z.array(z.string()),
  }),
});

export type IcpEdits = z.infer<typeof icpEditsSchema>;

// rubricSchema mirrors the dimension keys the orchestrator updates.
export const icpRubricSchema = z.object({
  product: productSchema.optional(),
  buyer: buyerSchema.optional(),
  firmographics: firmographicsSchema.optional(),
  technographics: technographicsSchema.optional(),
  signals: signalsSchema.optional(),
  disqualifiers: z.array(z.string()).optional(),
  proof_points: proofPointsSchema.optional(),
});
