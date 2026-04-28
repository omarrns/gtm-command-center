"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EditableField } from "@/components/ui/editable-field";
import { ReviewFormSection } from "@/components/ui/review-form-section";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import { updateIcpRubricAction } from "../_actions/update-icp-rubric";

const REFRESH_HREF = "/onboard?mode=refresh&template=icp_definition";

interface ArtifactSummary {
  id: string;
  kind: string;
  source_label: string | null;
  source_url: string | null;
  status: string;
}

const KIND_LABEL: Record<string, string> = {
  positive_example: "Positive",
  negative_example: "Negative",
  buyer_persona: "Buyer persona",
  company_context: "Context",
};

interface IcpDashboardClientProps {
  initialRubric: IcpRubric;
  artifacts: ArtifactSummary[];
  activationCompleted: boolean;
}

export function IcpDashboardClient({
  initialRubric,
  artifacts,
  activationCompleted,
}: IcpDashboardClientProps) {
  const [rubric, setRubric] = useState<IcpRubric>(initialRubric);
  const [, startTransition] = useTransition();

  // Every commit fires a full-rubric upsert. Concurrent edits are safe for a
  // single user: each commit sends the latest client state, so a later save
  // supersedes an earlier in-flight one.
  function persist(next: IcpRubric) {
    setRubric(next);
    startTransition(async () => {
      const result = await updateIcpRubricAction(next);
      if (!result.ok) {
        toast.error(result.error ?? "Save failed");
      }
    });
  }

  function updateProduct<K extends keyof NonNullable<IcpRubric["product"]>>(
    key: K,
  ) {
    return (value: string) => {
      persist({
        ...rubric,
        product: {
          category: rubric.product?.category ?? "",
          core_jtbd: rubric.product?.core_jtbd ?? "",
          wedge: rubric.product?.wedge ?? "",
          delivery_model: rubric.product?.delivery_model ?? "",
          [key]: value,
        },
      });
    };
  }

  function updateBuyer<K extends keyof NonNullable<IcpRubric["buyer"]>>(
    key: K,
  ) {
    return (value: string) => {
      persist({
        ...rubric,
        buyer: {
          economic_buyer: rubric.buyer?.economic_buyer ?? "",
          champion: rubric.buyer?.champion ?? "",
          end_user: rubric.buyer?.end_user ?? "",
          deal_blocker: rubric.buyer?.deal_blocker ?? "",
          [key]: value,
        },
      });
    };
  }

  function updateFirmographicsList<
    K extends "industries" | "stages" | "geographies",
  >(key: K) {
    return (value: string[]) => {
      persist({
        ...rubric,
        firmographics: {
          industries: rubric.firmographics?.industries ?? [],
          employee_range: rubric.firmographics?.employee_range ?? {
            min: 0,
            max: 10000,
          },
          business_model: rubric.firmographics?.business_model ?? "",
          stages: rubric.firmographics?.stages ?? [],
          geographies: rubric.firmographics?.geographies ?? [],
          [key]: value,
        },
      });
    };
  }

  function updateEmployeeRange(
    key: "min" | "max",
  ) {
    return (value: string) => {
      const parsed = Math.max(0, parseInt(value, 10) || 0);
      persist({
        ...rubric,
        firmographics: {
          industries: rubric.firmographics?.industries ?? [],
          employee_range: {
            min: rubric.firmographics?.employee_range.min ?? 0,
            max: rubric.firmographics?.employee_range.max ?? 10000,
            [key]: parsed,
          },
          business_model: rubric.firmographics?.business_model ?? "",
          stages: rubric.firmographics?.stages ?? [],
          geographies: rubric.firmographics?.geographies ?? [],
        },
      });
    };
  }

  function updateTechnographics<
    K extends keyof NonNullable<IcpRubric["technographics"]>,
  >(key: K) {
    return (value: string[]) => {
      persist({
        ...rubric,
        technographics: {
          required_tools: rubric.technographics?.required_tools ?? [],
          excluded_tools: rubric.technographics?.excluded_tools ?? [],
          tech_maturity: rubric.technographics?.tech_maturity ?? "",
          data_infrastructure:
            rubric.technographics?.data_infrastructure ?? "",
          [key]: value,
        },
      });
    };
  }

  function updateSignals<K extends keyof NonNullable<IcpRubric["signals"]>>(
    key: K,
  ) {
    return (value: string[]) => {
      persist({
        ...rubric,
        signals: {
          hiring_roles: rubric.signals?.hiring_roles ?? [],
          jtbd_evidence: rubric.signals?.jtbd_evidence ?? [],
          trigger_events: rubric.signals?.trigger_events ?? [],
          pain_language: rubric.signals?.pain_language ?? [],
          [key]: value,
        },
      });
    };
  }

  function updateDisqualifiers(value: string[]) {
    persist({
      ...rubric,
      disqualifiers: {
        ...rubric.disqualifiers,
        behavioral_disqualifiers: value,
      },
    });
  }

  function updateProofPoints<
    K extends keyof NonNullable<IcpRubric["proof_points"]>,
  >(key: K) {
    return (value: string[]) => {
      persist({
        ...rubric,
        proof_points: {
          existing_customers: rubric.proof_points?.existing_customers ?? [],
          won_deals: rubric.proof_points?.won_deals ?? [],
          lost_deals_reasons: rubric.proof_points?.lost_deals_reasons ?? [],
          [key]: value,
        },
      });
    };
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Your ICP</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-2">
            Synthesized from your exemplars, buyer personas, and product
            context. Click any field to refine.
          </p>
        </div>
        <Link
          href={REFRESH_HREF}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <RefreshCw size={14} />
          Refresh ICP
        </Link>
      </header>

      <ReviewFormSection title="Product">
        <div className="space-y-4">
          <EditableField
            label="Category"
            kind="text"
            value={rubric.product?.category ?? ""}
            onCommit={updateProduct("category")}
          />
          <EditableField
            label="Core JTBD"
            kind="text"
            value={rubric.product?.core_jtbd ?? ""}
            onCommit={updateProduct("core_jtbd")}
          />
          <EditableField
            label="Wedge"
            kind="text"
            value={rubric.product?.wedge ?? ""}
            onCommit={updateProduct("wedge")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Buyer Roles">
        <div className="space-y-4">
          <EditableField
            label="Economic buyer"
            kind="text"
            value={rubric.buyer?.economic_buyer ?? ""}
            onCommit={updateBuyer("economic_buyer")}
          />
          <EditableField
            label="Champion"
            kind="text"
            value={rubric.buyer?.champion ?? ""}
            onCommit={updateBuyer("champion")}
          />
          <EditableField
            label="End user"
            kind="text"
            value={rubric.buyer?.end_user ?? ""}
            onCommit={updateBuyer("end_user")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Firmographics">
        <div className="space-y-4">
          <EditableField
            label="Industries"
            kind="list"
            value={rubric.firmographics?.industries ?? []}
            onCommit={updateFirmographicsList("industries")}
          />
          <div className="grid grid-cols-2 gap-4">
            <EditableField
              label="Min employees"
              kind="text"
              value={String(rubric.firmographics?.employee_range.min ?? 0)}
              onCommit={updateEmployeeRange("min")}
            />
            <EditableField
              label="Max employees"
              kind="text"
              value={String(rubric.firmographics?.employee_range.max ?? 10000)}
              onCommit={updateEmployeeRange("max")}
            />
          </div>
          <EditableField
            label="Stages"
            kind="list"
            value={rubric.firmographics?.stages ?? []}
            onCommit={updateFirmographicsList("stages")}
          />
          <EditableField
            label="Geographies"
            kind="list"
            value={rubric.firmographics?.geographies ?? []}
            onCommit={updateFirmographicsList("geographies")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Technographics">
        <div className="space-y-4">
          <EditableField
            label="Required tools"
            kind="list"
            value={rubric.technographics?.required_tools ?? []}
            onCommit={updateTechnographics("required_tools")}
          />
          <EditableField
            label="Excluded tools"
            kind="list"
            value={rubric.technographics?.excluded_tools ?? []}
            onCommit={updateTechnographics("excluded_tools")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Signals">
        <div className="space-y-4">
          <EditableField
            label="Hiring roles"
            kind="list"
            value={rubric.signals?.hiring_roles ?? []}
            onCommit={updateSignals("hiring_roles")}
          />
          <EditableField
            label="JTBD evidence"
            kind="list"
            value={rubric.signals?.jtbd_evidence ?? []}
            onCommit={updateSignals("jtbd_evidence")}
          />
          <EditableField
            label="Trigger events"
            kind="list"
            value={rubric.signals?.trigger_events ?? []}
            onCommit={updateSignals("trigger_events")}
          />
        </div>
      </ReviewFormSection>

      <ReviewFormSection title="Disqualifiers">
        <EditableField
          label="One per line"
          kind="list"
          value={rubric.disqualifiers.behavioral_disqualifiers}
          onCommit={updateDisqualifiers}
        />
      </ReviewFormSection>

      <ReviewFormSection title="Proof Points">
        <div className="space-y-4">
          <EditableField
            label="Existing customers"
            kind="list"
            value={rubric.proof_points?.existing_customers ?? []}
            onCommit={updateProofPoints("existing_customers")}
          />
          <EditableField
            label="Won deals"
            kind="list"
            value={rubric.proof_points?.won_deals ?? []}
            onCommit={updateProofPoints("won_deals")}
          />
          <EditableField
            label="Lost deal reasons"
            kind="list"
            value={rubric.proof_points?.lost_deals_reasons ?? []}
            onCommit={updateProofPoints("lost_deals_reasons")}
          />
        </div>
      </ReviewFormSection>

      <div className="mt-10 pt-6 border-t border-[var(--color-border-strong)] flex justify-end">
        <Link
          href={activationCompleted ? "/accounts" : "/activate"}
          className={buttonVariants()}
        >
          {activationCompleted ? "View Accounts" : "Find my accounts"}
        </Link>
      </div>

      {artifacts.length > 0 && (
        <ReviewFormSection title={`Exemplars (${artifacts.length})`}>
          <div className="space-y-3">
            {artifacts.map((a) => {
              const title = a.source_label ?? a.source_url ?? "Untitled";
              return (
                <div key={a.id} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-[var(--color-text)]">{title}</p>
                    <Badge variant="muted">
                      {KIND_LABEL[a.kind] ?? a.kind}
                    </Badge>
                  </div>
                  {a.source_url && (
                    <a
                      href={a.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--color-blue)] hover:underline"
                    >
                      {a.source_url}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </ReviewFormSection>
      )}
    </div>
  );
}
