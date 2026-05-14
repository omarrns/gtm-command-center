"use client";

import type {
  IcpAgentEventRow,
  IcpRevisionCandidateRow,
  IcpRevisionCommitRow,
} from "@/lib/icp-agent/types";
import { RollbackButton } from "../changes/_components/rollback-button";

interface IcpChangesPanelProps {
  commits: IcpRevisionCommitRow[];
  rejectedCandidates: IcpRevisionCandidateRow[];
  events: IcpAgentEventRow[];
}

export function IcpChangesPanel({
  commits,
  rejectedCandidates,
  events,
}: IcpChangesPanelProps) {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Agent trace
        </h2>
        <div className="space-y-2">
          {events.length === 0 ? (
            <Empty text="No ICP agent events logged yet." />
          ) : (
            events.map((event) => <EventRow key={event.id} event={event} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Applied commits
        </h2>
        <div className="space-y-3">
          {commits.length === 0 ? (
            <Empty text="No applied ICP commits yet." />
          ) : (
            commits.map((commit) => <CommitCard key={commit.id} commit={commit} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
          Rejected candidates
        </h2>
        <div className="space-y-3">
          {rejectedCandidates.length === 0 ? (
            <Empty text="No rejected candidates yet." />
          ) : (
            rejectedCandidates.map((candidate) => (
              <RejectedCard key={candidate.id} candidate={candidate} />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function EventRow({ event }: { event: IcpAgentEventRow }) {
  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={statusClass(event.status)}>{event.status}</span>
            <h3 className="font-medium text-[var(--color-text)]">
              {event.stage}
            </h3>
          </div>
          {event.message ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {event.message}
            </p>
          ) : null}
        </div>
        <span className="text-xs text-[var(--color-text-muted)]">
          {new Date(event.created_at).toLocaleString()}
        </span>
      </div>
      <Meta
        values={[
          event.model,
          event.duration_ms ? `${event.duration_ms}ms` : null,
          event.job_id ? `job ${shortId(event.job_id)}` : null,
          event.session_id ? `session ${shortId(event.session_id)}` : null,
          event.insight_id ? `insight ${shortId(event.insight_id)}` : null,
          event.candidate_id ? `candidate ${shortId(event.candidate_id)}` : null,
          event.commit_id ? `commit ${shortId(event.commit_id)}` : null,
        ]}
      />
      {event.evidence_ids.length > 0 ? (
        <PathList paths={event.evidence_ids.map((id) => `evidence ${shortId(id)}`)} />
      ) : null}
      <DecisionDetails metadata={event.metadata} />
      {event.error ? (
        <pre className="mt-3 overflow-x-auto rounded-md bg-[var(--color-surface-muted)] p-3 text-xs text-[var(--color-danger)]">
          {event.error}
        </pre>
      ) : null}
    </article>
  );
}

function DecisionDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const reason = stringValue(metadata.reason) ?? stringValue(metadata.policyError);
  const evidence = arrayValue(metadata.evidence);
  const proposal = recordValue(metadata.proposal);
  const patches = arrayValue(proposal?.patches ?? metadata.patches);
  const gateChecks = recordValue(metadata.gateChecks);
  const risks = arrayValue(metadata.risks);
  const policy = recordValue(metadata.policy);
  const diff = metadata.diff;

  if (
    !reason &&
    evidence.length === 0 &&
    !proposal &&
    patches.length === 0 &&
    !gateChecks &&
    risks.length === 0 &&
    !policy &&
    !diff
  ) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-3 text-xs">
      {reason ? <DetailBlock title="Decision rationale" value={reason} /> : null}
      {proposal ? <ProposalBlock proposal={proposal} /> : null}
      {evidence.length > 0 ? <EvidenceBlock evidence={evidence} /> : null}
      {patches.length > 0 ? <JsonBlock title="Proposed patch" value={patches} /> : null}
      {gateChecks ? <GateChecks value={gateChecks} /> : null}
      {risks.length > 0 ? <ListBlock title="Risks" items={risks} /> : null}
      {policy ? <PolicyBlock policy={policy} /> : null}
      {diff ? <JsonBlock title="Diff preview" value={diff} /> : null}
    </div>
  );
}

function ProposalBlock({ proposal }: { proposal: Record<string, unknown> }) {
  const title = stringValue(proposal.title);
  const reason = stringValue(proposal.reason);
  const confidence = numberValue(proposal.confidence);
  if (!title && !reason && confidence === null) return null;
  return (
    <div>
      <h4 className="font-medium text-[var(--color-text)]">Proposal</h4>
      <div className="mt-1 space-y-1 text-[var(--color-text-muted)]">
        {title ? <p>{title}</p> : null}
        {reason ? <p>{reason}</p> : null}
        {confidence !== null ? <p>{Math.round(confidence * 100)}% confidence</p> : null}
      </div>
    </div>
  );
}

function EvidenceBlock({ evidence }: { evidence: unknown[] }) {
  return (
    <div>
      <h4 className="font-medium text-[var(--color-text)]">Evidence reviewed</h4>
      <div className="mt-2 space-y-2">
        {evidence.map((item, index) => {
          const row = recordValue(item);
          const title = stringValue(row?.title) ?? `Evidence ${index + 1}`;
          const detail = stringValue(row?.detail);
          const confidence = numberValue(row?.confidence);
          return (
            <div key={index} className="rounded bg-[var(--color-surface)] p-2">
              <div className="font-medium text-[var(--color-text)]">{title}</div>
              {detail ? (
                <p className="mt-1 text-[var(--color-text-muted)]">{detail}</p>
              ) : null}
              {confidence !== null ? (
                <p className="mt-1 text-[var(--color-text-muted)]">
                  {Math.round(confidence * 100)}% confidence
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GateChecks({ value }: { value: Record<string, unknown> }) {
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="font-medium text-[var(--color-text)]">Approval gates</h4>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entries.map(([key, passed]) => (
          <span
            key={key}
            className={[
              "rounded px-2 py-1",
              passed
                ? "bg-emerald-500/10 text-emerald-700"
                : "bg-amber-500/10 text-amber-700",
            ].join(" ")}
          >
            {labelize(key)}: {passed ? "pass" : "stop"}
          </span>
        ))}
      </div>
    </div>
  );
}

function PolicyBlock({ policy }: { policy: Record<string, unknown> }) {
  const lines = Object.entries(policy).flatMap(([key, value]) => {
    const items = arrayValue(value);
    return items.length > 0 ? [`${labelize(key)}: ${items.join(", ")}`] : [];
  });
  return <ListBlock title="Local policy" items={lines} />;
}

function DetailBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <h4 className="font-medium text-[var(--color-text)]">{title}</h4>
      <p className="mt-1 text-[var(--color-text-muted)]">{value}</p>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: unknown[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="font-medium text-[var(--color-text)]">{title}</h4>
      <ul className="mt-1 space-y-1 text-[var(--color-text-muted)]">
        {items.map((item, index) => (
          <li key={index}>{String(item)}</li>
        ))}
      </ul>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <h4 className="font-medium text-[var(--color-text)]">{title}</h4>
      <pre className="mt-1 overflow-x-auto rounded bg-[var(--color-surface)] p-2">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function CommitCard({ commit }: { commit: IcpRevisionCommitRow }) {
  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-[var(--color-text)]">{commit.title}</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {commit.reason}
          </p>
        </div>
        {commit.target !== "rollback" && <RollbackButton commitId={commit.id} />}
      </div>
      <Meta
        values={[
          commit.target,
          `${Math.round(commit.confidence * 100)}% confidence`,
          new Date(commit.created_at).toLocaleString(),
        ]}
      />
      <PathList paths={commit.changed_paths} />
      <pre className="mt-3 overflow-x-auto rounded-md bg-[var(--color-surface-muted)] p-3 text-xs">
        {JSON.stringify(commit.diff, null, 2)}
      </pre>
    </article>
  );
}

function RejectedCard({ candidate }: { candidate: IcpRevisionCandidateRow }) {
  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h3 className="font-medium text-[var(--color-text)]">{candidate.title}</h3>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {candidate.reason}
      </p>
      <Meta
        values={[
          candidate.target,
          `${Math.round(candidate.confidence * 100)}% confidence`,
          new Date(candidate.created_at).toLocaleString(),
        ]}
      />
      <pre className="mt-3 overflow-x-auto rounded-md bg-[var(--color-surface-muted)] p-3 text-xs">
        {JSON.stringify(candidate.judge_result, null, 2)}
      </pre>
    </article>
  );
}

function PathList({ paths }: { paths: string[] }) {
  if (paths.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {paths.map((path) => (
        <span
          key={path}
          className="rounded bg-[var(--color-surface-muted)] px-2 py-1 text-xs"
        >
          {path}
        </span>
      ))}
    </div>
  );
}

function Meta({ values }: { values: Array<string | null> }) {
  const present = values.filter((value): value is string => Boolean(value));
  if (present.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]">
      {present.map((value) => (
        <span key={value}>{value}</span>
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-text-muted)]">
      {text}
    </div>
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function labelize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
}

function statusClass(status: IcpAgentEventRow["status"]): string {
  const base = "rounded px-2 py-0.5 text-xs";
  if (status === "succeeded") return `${base} bg-emerald-500/10 text-emerald-700`;
  if (status === "failed") return `${base} bg-red-500/10 text-red-700`;
  if (status === "skipped") return `${base} bg-amber-500/10 text-amber-700`;
  return `${base} bg-[var(--color-surface-muted)] text-[var(--color-text-muted)]`;
}
