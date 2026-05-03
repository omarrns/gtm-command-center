import type { IcpAgentContext } from "./context";
import { renderIcpContextForPrompt } from "./context";

export function buildIcpChatSystemPrompt(context: IcpAgentContext): string {
  return [
    "You are an ICP copilot for SDRs and account executives.",
    "Help prepare for calls, reason about account fit, identify objections, and suggest discovery questions.",
    "Use the saved ICP as the source of truth. If the user's account evidence contradicts it, call out the contradiction clearly.",
    "Do not claim you updated the ICP. You can say the session may be analyzed for future ICP calibration.",
    "",
    "<current_icp_context>",
    renderIcpContextForPrompt(context),
    "</current_icp_context>",
  ].join("\n");
}

export function buildSessionDistillPrompt({
  context,
  transcript,
}: {
  context: IcpAgentContext;
  transcript: string;
}): string {
  return [
    "Distill this SDR/AE ICP chat into durable evidence.",
    "Extract only evidence grounded in the transcript. Do not invent customers, outcomes, or market facts.",
    "Set explicitUpdateRequest=true only if the user asked to update/change/fix the ICP, rubric, narrative, or qualification criteria.",
    "",
    "<current_icp_context>",
    renderIcpContextForPrompt(context),
    "</current_icp_context>",
    "",
    "<transcript>",
    transcript,
    "</transcript>",
  ].join("\n");
}

export function buildEvidenceRouterPrompt(insights: unknown): string {
  return [
    "Classify these ICP-chat insights into durable evidence items.",
    "Use icp_calibration only for evidence that may justify changing the ICP rubric or buyer narrative.",
    "Use messaging_lesson for objection, positioning, proof, or wording lessons that improve outreach but do not change who the ICP is.",
    "Use account_memory for facts about one named account only.",
    "Use ignored for weak, speculative, duplicate, or non-actionable notes.",
    "Set shouldEvaluateRevision=true only for high-confidence ICP calibration or explicit update requests.",
    "",
    "<insights>",
    JSON.stringify(insights, null, 2),
    "</insights>",
  ].join("\n");
}

export function buildRevisionCriticPrompt({
  context,
  evidence,
}: {
  context: IcpAgentContext;
  evidence: unknown[];
}): string {
  return [
    "Propose a conservative ICP update from the evidence, or decline.",
    "V1 supports narrow string-array patches to these rubric paths:",
    "- append to /firmographics/stages",
    "- remove from /disqualifiers/stage_disqualifiers",
    "- /proof_points/existing_customers",
    "- /proof_points/won_deals",
    "- /proof_points/lost_deals_reasons",
    "- /signals/pain_language",
    "- /signals/trigger_events",
    "- /signals/jtbd_evidence",
    "For proof_points and signals, use op=append only.",
    "Use op=remove only when removing a directly contradicted stage disqualifier.",
    "For an explicit stage expansion like seed/pre-seed, append those stages and remove matching stage disqualifiers if present.",
    "V1 supports append-only patches to these narrative paths:",
    "- /decision_criteria",
    "- /failed_workarounds",
    "- /aha",
    "Use target=rubric for /firmographics/*, /disqualifiers/*, /proof_points/*, or /signals/* paths.",
    "Use target=narrative for /decision_criteria, /failed_workarounds, or /aha.",
    "Decline if the evidence requires changing scalar fields, rewriting prose, or making a broad rewrite.",
    "",
    "<current_icp_context>",
    renderIcpContextForPrompt(context),
    "</current_icp_context>",
    "",
    "<evidence>",
    JSON.stringify(evidence, null, 2),
    "</evidence>",
  ].join("\n");
}

export function buildJudgePrompt({
  proposal,
  evidence,
}: {
  proposal: unknown;
  evidence: unknown[];
}): string {
  return [
    "Judge whether this proposed automatic ICP update is safe to apply.",
    "Approve only if every patch is evidence-backed, narrow, and useful.",
    "Allowed non-append action: removing a stage disqualifier that is directly contradicted by explicit evidence.",
    "Reject if it is speculative, broad, conflicting, duplicate, or unsupported by the evidence.",
    "",
    "<proposal>",
    JSON.stringify(proposal, null, 2),
    "</proposal>",
    "",
    "<evidence>",
    JSON.stringify(evidence, null, 2),
    "</evidence>",
  ].join("\n");
}
