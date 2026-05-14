"use client";

import { useMemo, useState } from "react";
import type React from "react";
import type {
  VideoIcpAnalysis,
  VideoIcpComment,
  VideoIcpTranscript,
} from "@/lib/video-icp/schemas";
import type { VideoIcpCommentsStatus } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface ReviewResultProps {
  analysis: VideoIcpAnalysis;
  transcript: VideoIcpTranscript;
  comments: VideoIcpComment[] | null;
  commentsStatus: VideoIcpCommentsStatus;
  commentsError: string | null;
}

export function ReviewResult({
  analysis,
  transcript,
  comments,
  commentsStatus,
  commentsError,
}: ReviewResultProps) {
  const [personaId, setPersonaId] = useState("all");
  const annotations = useMemo(
    () =>
      analysis.timeline.filter(
        (item) => personaId === "all" || item.personaId === personaId,
      ),
    [analysis.timeline, personaId],
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-muted)]">
            Directional synthetic preview. Use raw comments only as a sanity
            check, not as an ICP score.
          </p>
          <PersonaTabs
            personas={analysis.personas}
            selected={personaId}
            onSelect={setPersonaId}
          />
          <OverallPanel analysis={analysis} />
        </div>
        <CtaPanel analysis={analysis} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <TranscriptPanel
          transcript={transcript}
          annotations={annotations}
          personaId={personaId}
        />
        <TimelinePanel annotations={annotations} />
      </section>

      <CommentsPanel
        comments={comments}
        commentsStatus={commentsStatus}
        commentsError={commentsError}
      />
    </div>
  );
}

function PersonaTabs({
  personas,
  selected,
  onSelect,
}: {
  personas: VideoIcpAnalysis["personas"];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <PersonaButton active={selected === "all"} onClick={() => onSelect("all")}>
        All
      </PersonaButton>
      {personas.map((persona) => (
        <PersonaButton
          key={persona.id}
          active={selected === persona.id}
          onClick={() => onSelect(persona.id)}
        >
          {persona.name}
        </PersonaButton>
      ))}
    </div>
  );
}

function PersonaButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-[var(--color-blue)] bg-[var(--color-blue-muted)] text-[var(--color-blue)]"
          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]",
      )}
    >
      {children}
    </button>
  );
}

function OverallPanel({ analysis }: { analysis: VideoIcpAnalysis }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <h2 className="text-sm font-medium text-[var(--color-text)]">Overall</h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {analysis.overall.summary}
      </p>
      <h3 className="mt-4 text-xs font-medium uppercase text-[var(--color-text-subtle)]">
        Recommended edits
      </h3>
      <ul className="mt-2 space-y-2 text-sm text-[var(--color-text)]">
        {analysis.overall.recommendedEdits.map((edit) => (
          <li key={edit}>- {edit}</li>
        ))}
      </ul>
    </div>
  );
}

function CtaPanel({ analysis }: { analysis: VideoIcpAnalysis }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <h2 className="text-sm font-medium text-[var(--color-text)]">CTA Fit</h2>
      <div className="mt-3 space-y-3">
        {analysis.ctaFit.map((cta) => (
          <div key={cta.personaId} className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-[var(--color-text)]">
                {cta.personaId}
              </span>
              <span className="rounded bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs capitalize text-[var(--color-text-muted)]">
                {cta.fit}
              </span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              {cta.reasoning}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function TranscriptPanel({
  transcript,
  annotations,
  personaId,
}: {
  transcript: VideoIcpTranscript;
  annotations: VideoIcpAnalysis["timeline"];
  personaId: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <h2 className="text-sm font-medium text-[var(--color-text)]">
        Transcript scrubber
      </h2>
      <div className="mt-3 max-h-[720px] space-y-3 overflow-y-auto pr-1">
        {transcript.paragraphs.map((paragraph, index) => {
          const nextParagraph = transcript.paragraphs[index + 1];
          const matches = annotations.filter(
            (item) =>
              item.startSec >= paragraph.startSec &&
              (!nextParagraph || item.startSec < nextParagraph.startSec),
          );
          return (
            <div key={paragraph.startSec} className="space-y-2">
              <p className="text-xs font-medium text-[var(--color-blue)]">
                {formatTime(paragraph.startSec)}
              </p>
              <p className="text-sm leading-6 text-[var(--color-text)]">
                {paragraph.text}
              </p>
              {matches.length > 0 && (
                <div className="space-y-2">
                  {matches.map((item, index) => (
                    <Annotation
                      key={`${item.personaId}-${item.reactionType}-${index}`}
                    >
                      {personaId === "all" ? `${item.personaId}: ` : ""}
                      {item.interpretation}
                    </Annotation>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelinePanel({
  annotations,
}: {
  annotations: VideoIcpAnalysis["timeline"];
}) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <h2 className="text-sm font-medium text-[var(--color-text)]">
        Annotated moments
      </h2>
      <div className="mt-3 space-y-3">
        {annotations.map((item) => (
          <div
            key={`${item.personaId}-${item.startSec}-${item.reactionType}`}
            className="space-y-1 border-l border-[var(--color-border)] pl-3"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-[var(--color-blue)]">
                {formatTime(item.startSec)}
              </span>
              <span className="text-[var(--color-text-muted)]">
                {item.personaId}
              </span>
              <span className="rounded bg-[var(--color-surface-muted)] px-1.5 py-0.5 capitalize text-[var(--color-text-muted)]">
                {item.reactionType}
              </span>
            </div>
            <p className="text-sm text-[var(--color-text)]">
              {item.interpretation}
            </p>
            <p className="text-sm text-[var(--color-text-muted)]">
              {item.recommendedEdit}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentsPanel({
  comments,
  commentsStatus,
  commentsError,
}: {
  comments: VideoIcpComment[] | null;
  commentsStatus: VideoIcpCommentsStatus;
  commentsError: string | null;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] p-4">
      <h2 className="text-sm font-medium text-[var(--color-text)]">
        Raw comments
      </h2>
      {commentsStatus === "failed" ? (
        <p className="mt-3 text-sm text-[var(--color-danger)]">
          Comments unavailable: {commentsError ?? "fetch failed"}
        </p>
      ) : comments && comments.length > 0 ? (
        <div className="mt-3 divide-y divide-[var(--color-border)]">
          {comments.map((comment) => (
            <div key={comment.id} className="py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {comment.author || "Unknown commenter"}
                </p>
                <p className="text-xs text-[var(--color-text-subtle)]">
                  {comment.likeCount ?? 0} likes
                </p>
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {comment.text}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          Comment fetch succeeded, but no comments were returned.
        </p>
      )}
    </section>
  );
}

function Annotation({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md bg-[var(--color-blue-muted)] px-3 py-2 text-xs text-[var(--color-blue)]">
      {children}
    </p>
  );
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
