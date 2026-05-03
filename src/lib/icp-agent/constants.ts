export const ICP_SESSION_DISTILL_JOB = "icp-session-distill";
export const ICP_EVIDENCE_ROUTE_JOB = "icp-evidence-route";
export const ICP_REVISION_EVALUATE_JOB = "icp-revision-evaluate";
export const ICP_REVISION_CONSOLIDATE_JOB = "icp-revision-consolidate";

export const ICP_AGENT_JOB_TYPES = [
  ICP_SESSION_DISTILL_JOB,
  ICP_EVIDENCE_ROUTE_JOB,
  ICP_REVISION_EVALUATE_JOB,
  ICP_REVISION_CONSOLIDATE_JOB,
] as const;
