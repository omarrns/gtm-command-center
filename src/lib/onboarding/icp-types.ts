export type EvidenceStrength =
  | "direct_user_provided"
  | "inferred_from_customer_examples"
  | "inferred_from_public_data"
  | "weak_or_unknown";

export type EvidenceSourceType =
  | "artifact"
  | "url"
  | "user_answer"
  | "public_research";

export interface EvidenceSource {
  type: EvidenceSourceType;
  label: string;
  quote?: string;
}

export interface ProductIcpRubric {
  category: string;
  core_jtbd: string;
  wedge: string;
  delivery_model: string;
}

export interface BuyerIcpRubric {
  economic_buyer: string;
  champion: string;
  end_user: string;
  deal_blocker: string;
}

export interface EmployeeRange {
  min: number;
  max: number | null;
}

export interface FirmographicsIcpRubric {
  industries: string[];
  business_model: string;
  employee_range: EmployeeRange;
  stages: string[];
  geographies: string[];
}

export interface TechnographicsIcpRubric {
  required_tools: string[];
  excluded_tools: string[];
  tech_maturity: string;
  data_infrastructure: string;
}

export interface SignalsIcpRubric {
  hiring_roles: string[];
  jtbd_evidence: string[];
  trigger_events: string[];
  pain_language: string[];
}

export interface DisqualifiersIcpRubric {
  tech_disqualifiers: string[];
  size_disqualifiers: string;
  stage_disqualifiers: string[];
  behavioral_disqualifiers: string[];
}

export interface ProofPointsIcpRubric {
  existing_customers: string[];
  won_deals: string[];
  lost_deals_reasons: string[];
}

export interface SubDimensionEvidence {
  strength: EvidenceStrength;
  proofPoints: string[];
  sources: EvidenceSource[];
  notes: string;
}

export type IcpEvidence = {
  product: Record<keyof ProductIcpRubric, SubDimensionEvidence>;
  buyer: Record<keyof BuyerIcpRubric, SubDimensionEvidence>;
  firmographics: Record<keyof FirmographicsIcpRubric, SubDimensionEvidence>;
  technographics: Record<
    keyof TechnographicsIcpRubric,
    SubDimensionEvidence
  >;
  signals: Record<keyof SignalsIcpRubric, SubDimensionEvidence>;
  disqualifiers: Record<
    keyof DisqualifiersIcpRubric,
    SubDimensionEvidence
  >;
};

export interface CoreIcpRubric {
  product: ProductIcpRubric;
  buyer: BuyerIcpRubric;
  firmographics: FirmographicsIcpRubric;
  technographics: TechnographicsIcpRubric;
  signals: SignalsIcpRubric;
  disqualifiers: DisqualifiersIcpRubric;
}

export interface IcpRubric extends CoreIcpRubric {
  proof_points: ProofPointsIcpRubric;
  evidence: IcpEvidence;
}
