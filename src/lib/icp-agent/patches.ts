import { parseIcpRubric } from "@/lib/onboarding/icp-schemas";
import {
  formatIcpNarrativeAsMarkdown,
  parseIcpNarrativeMarkdown,
} from "@/lib/onboarding/templates/icp-definition/narrative-formatter";
import type { IcpNarrativeArc } from "@/lib/onboarding/icp-narrative-schema";
import type { RevisionPatch } from "./schemas";

const RUBRIC_ARRAY_PATHS = new Set([
  "/proof_points/existing_customers",
  "/proof_points/won_deals",
  "/proof_points/lost_deals_reasons",
  "/signals/pain_language",
  "/signals/trigger_events",
  "/signals/jtbd_evidence",
]);

const NARRATIVE_ARRAY_PATHS = new Set([
  "/decision_criteria",
  "/failed_workarounds",
  "/aha",
]);

export interface PatchResult {
  ok: true;
  after: Record<string, unknown>;
  changedPaths: string[];
  diff: Record<string, unknown>;
}

export function applyRubricPatches(
  input: unknown,
  patches: RevisionPatch[],
): PatchResult | { ok: false; error: string } {
  const rubric = parseIcpRubric(input);
  const next = structuredClone(rubric) as unknown as Record<string, unknown>;
  const changedPaths: string[] = [];

  for (const patch of patches) {
    if (!RUBRIC_ARRAY_PATHS.has(patch.path)) {
      return { ok: false, error: `Unsupported rubric path: ${patch.path}` };
    }
    if (appendUnique(next, patch.path, patch.value)) {
      changedPaths.push(patch.path);
    }
  }

  if (changedPaths.length === 0) {
    return { ok: false, error: "Patch produced no changes." };
  }

  return {
    ok: true,
    after: next,
    changedPaths,
    diff: buildDiff(
      rubric as unknown as Record<string, unknown>,
      next,
      changedPaths,
    ),
  };
}

export function applyNarrativePatches(
  content: string | null,
  patches: RevisionPatch[],
): PatchResult | { ok: false; error: string } {
  const arc = parseIcpNarrativeMarkdown(content);
  const next = structuredClone(arc) as Record<string, unknown>;
  const changedPaths: string[] = [];

  for (const patch of patches) {
    if (!NARRATIVE_ARRAY_PATHS.has(patch.path)) {
      return { ok: false, error: `Unsupported narrative path: ${patch.path}` };
    }
    if (appendUnique(next, patch.path, patch.value)) {
      changedPaths.push(patch.path);
    }
  }

  if (changedPaths.length === 0) {
    return { ok: false, error: "Patch produced no changes." };
  }

  return {
    ok: true,
    after: {
      arc: next,
      content: formatIcpNarrativeAsMarkdown(next as IcpNarrativeArc),
    },
    changedPaths,
    diff: buildDiff(arc as Record<string, unknown>, next, changedPaths),
  };
}

function appendUnique(
  target: Record<string, unknown>,
  pointer: string,
  value: string,
): boolean {
  const parts = pointer.split("/").filter(Boolean);
  const key = parts.pop();
  if (!key) return false;

  let cursor: Record<string, unknown> = target;
  for (const part of parts) {
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next)) return false;
    cursor = next as Record<string, unknown>;
  }

  const arr = cursor[key];
  if (!Array.isArray(arr)) return false;
  const trimmed = value.trim();
  if (!trimmed || arr.some((item) => String(item) === trimmed)) return false;
  cursor[key] = [...arr, trimmed];
  return true;
}

function buildDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  paths: string[],
): Record<string, unknown> {
  return {
    patches: paths.map((path) => ({
      path,
      before: readPointer(before, path),
      after: readPointer(after, path),
    })),
  };
}

function readPointer(target: Record<string, unknown>, pointer: string): unknown {
  let cursor: unknown = target;
  for (const part of pointer.split("/").filter(Boolean)) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor ?? null;
}
