"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, Globe, User } from "lucide-react";
import { SectionHeader } from "../../section-header";
import type { OrchestratorState } from "@/lib/onboarding/orchestrator/types";

// Section 8 of the ICP review. Collapsible (default collapsed) list of
// every artifact the orchestrator drew from. The user can audit how
// each exemplar mapped to the synthesized rubric. Per-artifact bodies
// are inline-expandable so a long page doesn't load until clicked.
//
// We render from orchestrator_state.artifacts rather than re-fetching
// onboarding_artifacts — the state already has the manifest with
// kind / source / status, and that's all this section needs.

const KIND_LABEL: Record<string, string> = {
  positive_example: "Positive example",
  negative_example: "Negative example",
  buyer_persona: "Buyer persona",
  company_context: "Company context",
};

function kindIcon(kind: string) {
  if (kind === "buyer_persona") return User;
  if (kind === "company_context") return FileText;
  return Globe;
}

interface PerExemplarBreakdownProps {
  isExpanded: boolean;
  onToggle: () => void;
  orchestratorState: OrchestratorState | null;
}

export function PerExemplarBreakdown({
  isExpanded,
  onToggle,
  orchestratorState,
}: PerExemplarBreakdownProps) {
  const [openArtifactId, setOpenArtifactId] = useState<string | null>(null);

  if (!orchestratorState || orchestratorState.artifacts.length === 0) {
    return null;
  }

  return (
    <div className="surface p-5 mb-4">
      <SectionHeader
        title={`Per-exemplar breakdown (${orchestratorState.artifacts.length})`}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />
      {isExpanded && (
        <div className="mt-2 space-y-2">
          {orchestratorState.artifacts.map((a) => {
            const Icon = kindIcon(a.kind);
            const isOpen = openArtifactId === a.id;
            const provenanceCount = Object.values(
              orchestratorState.dimensions,
            ).reduce(
              (n, d) =>
                n + d.provenance.filter((p) => p.artifactId === a.id).length,
              0,
            );
            return (
              <div
                key={a.id}
                className="rounded-md border border-[var(--color-border-strong)] p-3"
              >
                <button
                  type="button"
                  onClick={() => setOpenArtifactId(isOpen ? null : a.id)}
                  className="flex w-full items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      size={14}
                      className="text-[var(--color-text-subtle)]"
                    />
                    <div className="text-left">
                      <p className="text-sm font-medium">
                        {a.sourceLabel ?? a.sourceUrl ?? "Untitled artifact"}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-subtle)]">
                        {KIND_LABEL[a.kind] ?? a.kind} · {a.status} · cited in{" "}
                        {provenanceCount}{" "}
                        {provenanceCount === 1 ? "dimension" : "dimensions"}
                      </p>
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronUp
                      size={14}
                      className="text-[var(--color-text-subtle)]"
                    />
                  ) : (
                    <ChevronDown
                      size={14}
                      className="text-[var(--color-text-subtle)]"
                    />
                  )}
                </button>
                {isOpen && a.errorMessage && (
                  <p className="mt-2 text-xs text-[var(--color-danger)]">
                    {a.errorMessage}
                  </p>
                )}
                {isOpen && a.sourceUrl && (
                  <p className="mt-2 text-xs">
                    <a
                      href={a.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-blue)] hover:underline"
                    >
                      Open source ↗
                    </a>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
