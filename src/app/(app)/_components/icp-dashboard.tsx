// SPEC-3 Phase 6.a: GTM post-confirm surface. Read-only render of the
// synthesized ICP — narrative summary + structured rubric + proof
// points + disqualifiers + exemplar provenance. Edits happen via
// /onboard?mode=refresh&template=icp_definition; this dashboard is
// the v1 deliverable for the GTM persona.
//
// Pure RSC. Loads all data inline given userId. The Accordion +
// Badge primitives live behind the client boundary in their own
// files — this wrapper composes them server-side.

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ListItem } from "@/components/list-item";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";

const REFRESH_HREF = "/onboard?mode=refresh&template=icp_definition";

interface IcpDashboardProps {
  userId: string;
}

interface ArtifactSummary {
  id: string;
  kind: string;
  source_label: string | null;
  source_url: string | null;
  status: string;
}

interface IcpRubric {
  product?: {
    category?: string;
    core_jtbd?: string;
    wedge?: string;
  };
  buyer?: {
    economic_buyer?: string;
    champion?: string;
    end_user?: string;
  };
  firmographics?: {
    industries?: string[];
    employee_range_min?: number;
    employee_range_max?: number;
    stages?: string[];
    geographies?: string[];
  };
  technographics?: {
    required_tools?: string[];
    excluded_tools?: string[];
  };
  signals?: {
    hiring_roles?: string[];
    jtbd_evidence?: string[];
    trigger_events?: string[];
  };
  disqualifiers?: string[];
  proof_points?: {
    existing_customers?: string[];
    won_deals?: string[];
    lost_deals_reasons?: string[];
  };
}

const KIND_LABEL: Record<string, string> = {
  positive_example: "Positive",
  negative_example: "Negative",
  buyer_persona: "Buyer persona",
  company_context: "Context",
};

export async function IcpDashboard({ userId }: IcpDashboardProps) {
  const svc = createSupabaseServiceClient();

  // The artifacts list is scoped to the most recent confirmed icp_definition
  // interview — the one whose synthesis produced this rubric.
  const { data: confirmedInterview } = await svc
    .from("onboarding_interviews")
    .select("id")
    .eq("user_id", userId)
    .eq("template_id", "icp_definition")
    .eq("status", "confirmed")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [
    icpDocRes,
    proofDocRes,
    disqualifiersDocRes,
    scoringRes,
    artifactsRes,
  ] = await Promise.all([
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", userId)
      .eq("document_key", "company_icp")
      .maybeSingle(),
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", userId)
      .eq("document_key", "icp_proof_points")
      .maybeSingle(),
    svc
      .from("memory_documents")
      .select("content")
      .eq("user_id", userId)
      .eq("document_key", "icp_disqualifiers")
      .maybeSingle(),
    svc
      .from("user_scoring_profiles")
      .select("icp_rubric")
      .eq("user_id", userId)
      .maybeSingle(),
    confirmedInterview
      ? svc
          .from("onboarding_artifacts")
          .select("id, kind, source_label, source_url, status")
          .eq("interview_id", confirmedInterview.id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as ArtifactSummary[] }),
  ]);

  const icpDoc = (icpDocRes.data?.content as string | null) ?? null;
  const proofDoc = (proofDocRes.data?.content as string | null) ?? null;
  const disqualifiersDoc =
    (disqualifiersDocRes.data?.content as string | null) ?? null;
  const rubric = (scoringRes.data?.icp_rubric as IcpRubric | null) ?? null;
  const artifacts = (artifactsRes.data ?? []) as ArtifactSummary[];

  // Hard fallback — if neither the rubric nor the narrative exists,
  // there's nothing to render. Send the user back to onboarding.
  if (!rubric && !icpDoc) {
    return (
      <>
        <PageHeader
          title="Your ICP"
          description="Synthesized from your exemplars, buyer personas, and product context."
        />
        <EmptyState
          message="Your ICP rubric isn't ready yet"
          hint="Finish onboarding to synthesize the rubric from your exemplars."
        >
          <Link href={REFRESH_HREF} className={buttonVariants()}>
            Set up your ICP
          </Link>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Your ICP"
        description="Synthesized from your exemplars, buyer personas, and product context."
      >
        <Link
          href={REFRESH_HREF}
          className={buttonVariants({ variant: "ghost" })}
        >
          <RefreshCw size={14} />
          Refresh ICP
        </Link>
      </PageHeader>

      {icpDoc && <NarrativeBlock title="Narrative summary" content={icpDoc} />}

      {rubric && <RubricAccordion rubric={rubric} />}

      {proofDoc && <NarrativeBlock title="Proof points" content={proofDoc} />}

      {disqualifiersDoc && (
        <NarrativeBlock title="Disqualifiers" content={disqualifiersDoc} />
      )}

      {artifacts.length > 0 && <ExemplarsAccordion artifacts={artifacts} />}
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function NarrativeBlock({
  title,
  content,
}: {
  title: string;
  content: string;
}) {
  return (
    <section className="surface p-5 mb-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--color-text)]">
        {content}
      </div>
    </section>
  );
}

interface RubricSection {
  key: string;
  label: string;
  count: number;
  body: React.ReactNode | null;
}

function RubricAccordion({ rubric }: { rubric: IcpRubric }) {
  const sections = buildRubricSections(rubric);
  return (
    <section className="surface p-5 mb-4">
      <h3 className="text-sm font-semibold mb-2">Structured rubric</h3>
      <Accordion>
        {sections.map((s) => (
          <AccordionItem key={s.key} value={s.key}>
            <AccordionTrigger>
              <span className="flex items-center gap-2">
                <span>{s.label}</span>
                {s.count === 0 ? (
                  <Badge variant="muted">not set</Badge>
                ) : (
                  <Badge variant="accent">{s.count}</Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {s.body ?? (
                <p className="text-xs text-[var(--color-text-muted)]">
                  Not captured in the latest synthesis.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function ExemplarsAccordion({ artifacts }: { artifacts: ArtifactSummary[] }) {
  return (
    <section className="surface p-5 mb-4">
      <Accordion>
        <AccordionItem value="exemplars">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <span>Exemplars</span>
              <Badge variant="muted">{artifacts.length}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2 mt-2">
              {artifacts.map((a) => {
                const title = a.source_label ?? a.source_url ?? "Untitled";
                const subtitle = `${KIND_LABEL[a.kind] ?? a.kind} · ${a.status}`;
                return (
                  <ListItem
                    key={a.id}
                    href={a.source_url ?? "#"}
                    title={title}
                    subtitle={subtitle}
                    meta={
                      <Badge variant="muted">
                        {KIND_LABEL[a.kind] ?? a.kind}
                      </Badge>
                    }
                  />
                );
              })}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

// ── Rubric section builders ─────────────────────────────────────────────────

function buildRubricSections(rubric: IcpRubric): RubricSection[] {
  return [
    buildBuyerSection(rubric.buyer),
    buildFirmographicsSection(rubric.firmographics),
    buildTechnographicsSection(rubric.technographics),
    buildSignalsSection(rubric.signals),
    buildDisqualifiersSection(rubric.disqualifiers),
    buildProofPointsSection(rubric.proof_points),
  ];
}

function buildBuyerSection(buyer: IcpRubric["buyer"]): RubricSection {
  if (!buyer) return emptySection("buyer", "Buyer roles");
  const rows = [
    ["Economic buyer", buyer.economic_buyer],
    ["Champion", buyer.champion],
    ["End user", buyer.end_user],
  ] as const;
  const filled = rows.filter(([, v]) => v && v.length > 0);
  return {
    key: "buyer",
    label: "Buyer roles",
    count: filled.length,
    body: filled.length === 0 ? null : <FieldList rows={rows} />,
  };
}

function buildFirmographicsSection(
  firmo: IcpRubric["firmographics"],
): RubricSection {
  if (!firmo) return emptySection("firmographics", "Firmographics");
  const industries = firmo.industries ?? [];
  const stages = firmo.stages ?? [];
  const geographies = firmo.geographies ?? [];
  const rangeSet =
    firmo.employee_range_min != null && firmo.employee_range_max != null;
  const count =
    industries.length + stages.length + geographies.length + (rangeSet ? 1 : 0);
  return {
    key: "firmographics",
    label: "Firmographics",
    count,
    body:
      count === 0 ? null : (
        <FieldList
          rows={[
            ["Industries", industries.join(" · ")],
            [
              "Employee range",
              rangeSet
                ? `${firmo.employee_range_min}–${firmo.employee_range_max}`
                : "",
            ],
            ["Stages", stages.join(" · ")],
            ["Geographies", geographies.join(" · ")],
          ]}
        />
      ),
  };
}

function buildTechnographicsSection(
  tech: IcpRubric["technographics"],
): RubricSection {
  if (!tech) return emptySection("technographics", "Technographics");
  const required = tech.required_tools ?? [];
  const excluded = tech.excluded_tools ?? [];
  const count = required.length + excluded.length;
  return {
    key: "technographics",
    label: "Technographics",
    count,
    body:
      count === 0 ? null : (
        <FieldList
          rows={[
            ["Required tools", required.join(" · ")],
            ["Excluded tools", excluded.join(" · ")],
          ]}
        />
      ),
  };
}

function buildSignalsSection(signals: IcpRubric["signals"]): RubricSection {
  if (!signals) return emptySection("signals", "Signals");
  const hiring = signals.hiring_roles ?? [];
  const jtbd = signals.jtbd_evidence ?? [];
  const triggers = signals.trigger_events ?? [];
  const count = hiring.length + jtbd.length + triggers.length;
  return {
    key: "signals",
    label: "Signals",
    count,
    body:
      count === 0 ? null : (
        <FieldList
          rows={[
            ["Hiring roles", hiring.join(" · ")],
            ["JTBD evidence", jtbd.join(" · ")],
            ["Trigger events", triggers.join(" · ")],
          ]}
        />
      ),
  };
}

function buildDisqualifiersSection(
  disqualifiers: IcpRubric["disqualifiers"],
): RubricSection {
  const items = disqualifiers ?? [];
  return {
    key: "disqualifiers",
    label: "Disqualifiers",
    count: items.length,
    body:
      items.length === 0 ? null : (
        <ul className="text-sm space-y-1 mt-1">
          {items.map((d, i) => (
            <li key={i} className="text-[var(--color-text)]">
              · {d}
            </li>
          ))}
        </ul>
      ),
  };
}

function buildProofPointsSection(
  proof: IcpRubric["proof_points"],
): RubricSection {
  if (!proof) return emptySection("proof_points", "Proof points");
  const customers = proof.existing_customers ?? [];
  const won = proof.won_deals ?? [];
  const lost = proof.lost_deals_reasons ?? [];
  const count = customers.length + won.length + lost.length;
  return {
    key: "proof_points",
    label: "Proof points",
    count,
    body:
      count === 0 ? null : (
        <FieldList
          rows={[
            ["Existing customers", customers.join(" · ")],
            ["Won deals", won.join(" · ")],
            ["Lost deal reasons", lost.join(" · ")],
          ]}
        />
      ),
  };
}

function emptySection(key: string, label: string): RubricSection {
  return { key, label, count: 0, body: null };
}

function FieldList({
  rows,
}: {
  rows: ReadonlyArray<readonly [string, string | undefined]>;
}) {
  const filled = rows.filter(([, v]) => v && v.length > 0);
  if (filled.length === 0) {
    return (
      <p className="text-xs text-[var(--color-text-muted)]">
        No values captured.
      </p>
    );
  }
  return (
    <dl className="text-sm space-y-1.5 mt-1">
      {filled.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[10rem_1fr] gap-3">
          <dt className="text-[var(--color-text-muted)]">{label}</dt>
          <dd className="text-[var(--color-text)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
