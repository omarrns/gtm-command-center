// SPEC-3 Phase 3.b: zod schemas for the icp_definition template.
//
// Split out of templates/icp-definition.ts to keep that file under the
// 400-line cap. These schemas are also re-usable by the Phase 5 ICP
// Review UI — a client component can import the types without pulling in
// the server-only template module.

import { z } from "zod";
import {
  ICP_DIMENSIONS,
  coerceIcpRubric,
  type BuyerIcpRubric,
  type DisqualifiersIcpRubric,
  type EvidenceSource,
  type EmployeeRange,
  type FirmographicsIcpRubric,
  type IcpEvidence,
  type IcpRubric,
  type ProductIcpRubric,
  type ProofPointsIcpRubric,
  type SignalsIcpRubric,
  type SubDimensionEvidence,
  type TechnographicsIcpRubric,
} from "@/lib/onboarding/icp-dimensions";

// Per-section sub-schemas. Exported individually so the adapter in
// orchestrator/to-confirm-edits.ts can safeParse each orchestrator
// dimension value against the right sub-shape — if the model emits a
// tuple or a differently-keyed object, the safeParse fails and the
// adapter falls back to defaults instead of silently letting a broken
// shape through. Per SPEC-3 audit finding (round 2, #2).

// Rubric-level buyer roles — economic buyer / champion / end user — as
// the *user* defined their ICP. Distinct from `opportunities.buyer_personas`
// (JSONB), which is per-account pipeline data populated by the GTM
// discovery step from TheirStack job metadata. The naming looks similar
// because they're related concepts at different layers of the stack.
export const buyerSchema = z.object({
  economic_buyer: z.string(),
  champion: z.string(),
  end_user: z.string(),
  deal_blocker: z.string(),
}) satisfies z.ZodType<BuyerIcpRubric>;

const employeeRangeSchema = z.object({
  min: z.number(),
  max: z.number().nullable(),
}) satisfies z.ZodType<EmployeeRange>;

export const firmographicsSchema = z.preprocess(
  (input) => coerceIcpRubric({ firmographics: input }).firmographics,
  z.object({
    industries: z.array(z.string()),
    business_model: z.string(),
    employee_range: employeeRangeSchema,
    stages: z.array(z.string()),
    geographies: z.array(z.string()),
  }) satisfies z.ZodType<FirmographicsIcpRubric>,
);

export const technographicsSchema = z.object({
  required_tools: z.array(z.string()),
  excluded_tools: z.array(z.string()),
  tech_maturity: z.string(),
  data_infrastructure: z.string(),
}) satisfies z.ZodType<TechnographicsIcpRubric>;

export const signalsSchema = z.object({
  hiring_roles: z.array(z.string()),
  jtbd_evidence: z.array(z.string()),
  trigger_events: z.array(z.string()),
  pain_language: z.array(z.string()),
}) satisfies z.ZodType<SignalsIcpRubric>;

export const productSchema = z.object({
  category: z.string(),
  core_jtbd: z.string(),
  wedge: z.string(),
  delivery_model: z.string(),
}) satisfies z.ZodType<ProductIcpRubric>;

export const proofPointsSchema = z.object({
  existing_customers: z.array(z.string()),
  won_deals: z.array(z.string()),
  lost_deals_reasons: z.array(z.string()),
}) satisfies z.ZodType<ProofPointsIcpRubric>;

const disqualifiersRubricSchema = z.object({
  tech_disqualifiers: z.array(z.string()),
  size_disqualifiers: z.string(),
  stage_disqualifiers: z.array(z.string()),
  behavioral_disqualifiers: z.array(z.string()),
}) satisfies z.ZodType<DisqualifiersIcpRubric>;

const proofPointsRubricSchema = z.object({
  existing_customers: z.array(z.string()),
  won_deals: z.array(z.string()),
  lost_deals_reasons: z.array(z.string()),
}) satisfies z.ZodType<ProofPointsIcpRubric>;

export interface IcpExtraction {
  product: ProductIcpRubric;
  icp: {
    buyer: BuyerIcpRubric;
    firmographics: FirmographicsIcpRubric;
    technographics: TechnographicsIcpRubric;
    signals: SignalsIcpRubric;
    disqualifiers: DisqualifiersIcpRubric;
  };
  proof_points: ProofPointsIcpRubric;
  evidence?: IcpEvidence;
}

export type IcpEdits = IcpExtraction;

function toCanonicalIcpExtraction(input: unknown): IcpExtraction {
  const rubric = coerceIcpRubric(input);
  return {
    product: rubric.product,
    icp: {
      buyer: rubric.buyer,
      firmographics: rubric.firmographics,
      technographics: rubric.technographics,
      signals: rubric.signals,
      disqualifiers: rubric.disqualifiers,
    },
    proof_points: rubric.proof_points,
    evidence: rubric.evidence,
  };
}

const canonicalIcpExtractionSchema = z.object({
  product: productSchema,
  icp: z.object({
    buyer: buyerSchema,
    firmographics: firmographicsSchema,
    technographics: technographicsSchema,
    signals: signalsSchema,
    disqualifiers: disqualifiersRubricSchema,
  }),
  proof_points: proofPointsSchema,
  evidence: z.lazy(() => icpEvidenceSchema).optional(),
}) as unknown as z.ZodType<IcpExtraction>;

export const icpExtractionSchema = z.preprocess(
  toCanonicalIcpExtraction,
  canonicalIcpExtractionSchema,
) as z.ZodType<IcpExtraction>;

// Edits mirror extraction — reviewer can tune any leaf on the review UI.
// Required (no defaults) so the review screen's form always round-trips a
// complete rubric; the orchestrator + extraction prefill defaults.
export const icpEditsSchema = z.preprocess(
  toCanonicalIcpExtraction,
  canonicalIcpExtractionSchema,
) as z.ZodType<IcpEdits>;

const subDimensionEvidenceSchema = z.object({
  strength: z.enum([
    "direct_user_provided",
    "inferred_from_customer_examples",
    "inferred_from_public_data",
    "weak_or_unknown",
  ]),
  proofPoints: z.array(z.string()),
  sources: z.array(
    z.object({
      type: z.enum(["artifact", "url", "user_answer", "public_research"]),
      label: z.string(),
      quote: z.string().optional(),
    }) satisfies z.ZodType<EvidenceSource>,
  ),
  notes: z.string(),
}) satisfies z.ZodType<SubDimensionEvidence>;

const icpEvidenceSchema = z.object(
  Object.fromEntries(
    ICP_DIMENSIONS.map((dimension) => [
      dimension.key,
      z.object(
        Object.fromEntries(
          dimension.subDimensions.map((subDimension) => [
            subDimension,
            subDimensionEvidenceSchema,
          ]),
        ),
      ),
    ]),
  ),
) as unknown as z.ZodType<IcpEvidence>;

const canonicalIcpRubricSchema = z.object({
  product: z.object({
    category: z.string(),
    core_jtbd: z.string(),
    wedge: z.string(),
    delivery_model: z.string(),
  }),
  buyer: z.object({
    economic_buyer: z.string(),
    champion: z.string(),
    end_user: z.string(),
    deal_blocker: z.string(),
  }),
  firmographics: z.object({
    industries: z.array(z.string()),
    business_model: z.string(),
    employee_range: employeeRangeSchema,
    stages: z.array(z.string()),
    geographies: z.array(z.string()),
  }),
  technographics: z.object({
    required_tools: z.array(z.string()),
    excluded_tools: z.array(z.string()),
    tech_maturity: z.string(),
    data_infrastructure: z.string(),
  }),
  signals: z.object({
    hiring_roles: z.array(z.string()),
    jtbd_evidence: z.array(z.string()),
    trigger_events: z.array(z.string()),
    pain_language: z.array(z.string()),
  }),
  disqualifiers: disqualifiersRubricSchema,
  proof_points: proofPointsRubricSchema,
  evidence: icpEvidenceSchema,
});

// Runtime JSONB compatibility boundary. Old saved rubrics are normalized
// before validation, so existing readers can keep using this stable export.
export const icpRubricSchema = z.preprocess(
  coerceIcpRubric,
  canonicalIcpRubricSchema,
) as z.ZodType<IcpRubric>;

export type { IcpRubric };
export { coerceIcpRubric };

export function parseIcpRubric(input: unknown): IcpRubric {
  return icpRubricSchema.parse(input);
}

export function safeParseIcpRubric(input: unknown) {
  return icpRubricSchema.safeParse(input);
}
