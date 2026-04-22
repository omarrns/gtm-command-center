/**
 * Artifact kind resolution from a template's ArtifactKindContract.
 *
 * Pure data-driven classifier — no React, no I/O. Consumed by
 * ArtifactInput at runtime and by scripts/test-artifact-kind-per-template
 * for regression coverage. Matchers run in declaration order; the first
 * substring match wins. When nothing matches, the contract's default
 * kind applies.
 */

import type { ArtifactKindContract } from "./types";

export function detectKindFromUrl(
  url: string,
  contract: ArtifactKindContract,
): string {
  const lower = url.toLowerCase();
  for (const matcher of contract.urlKindMatchers) {
    if (lower.includes(matcher.urlSubstring.toLowerCase())) return matcher.kind;
  }
  return contract.defaultUrlKind;
}

export function defaultTextKind(contract: ArtifactKindContract): string {
  return contract.defaultTextKind;
}

export function defaultFileKind(
  contract: ArtifactKindContract,
  fileName: string,
): string {
  const lower = fileName.toLowerCase();
  for (const matcher of contract.fileKindMatchers) {
    if (lower.includes(matcher.fileNameSubstring.toLowerCase()))
      return matcher.kind;
  }
  return contract.defaultFileKind;
}
