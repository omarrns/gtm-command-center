import Link from "next/link";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GenerateIcpNarrativeButton } from "../../_components/generate-icp-narrative-button";
import type { IcpRubric } from "@/lib/onboarding/icp-schemas";
import {
  deriveAdConceptSeed,
  deriveColdEmailOpener,
  deriveLandingHero,
  deriveSalesTalkTrack,
  type ArcBeats,
  type HookDerivation,
} from "./messaging-hub-helpers";

export function HooksSection({
  arcBeats,
  rubric,
}: {
  arcBeats: ArcBeats | null;
  rubric: IcpRubric | null;
}) {
  if (!arcBeats) {
    return (
      <Card className="border-dashed bg-muted/30">
        <CardHeader>
          <CardTitle>Hooks by channel</CardTitle>
        </CardHeader>
        <CardContent>
          {rubric ? (
            <GenerateIcpNarrativeButton variant="outline" />
          ) : (
            <RefreshPlaceholder>
              Generate your buyer narrative arc to populate channel hooks.
            </RefreshPlaceholder>
          )}
        </CardContent>
      </Card>
    );
  }

  const hooks = [
    {
      title: "Cold email",
      label: "Opener",
      hook: deriveColdEmailOpener(arcBeats, rubric),
    },
    {
      title: "Landing page",
      label: "Hero angle",
      hook: deriveLandingHero(arcBeats, rubric),
    },
    {
      title: "Paid ad",
      label: "Concept seed",
      hook: deriveAdConceptSeed(arcBeats, rubric),
    },
    {
      title: "Sales call",
      label: "Talk track",
      hook: deriveSalesTalkTrack(arcBeats),
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          Hooks by channel
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Starting points derived from the buyer narrative, not new AI output.
        </p>
      </div>
      {rubric === null && (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)]/30 px-3 py-2 text-xs text-[var(--color-text-muted)]">
          Refresh your ICP onboarding to add rubric overlays.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {hooks.map((item) => (
          <HookCard
            key={item.title}
            title={item.title}
            label={item.label}
            hook={item.hook}
          />
        ))}
      </div>
    </section>
  );
}

function HookCard({
  title,
  label,
  hook,
}: {
  title: string;
  label: string;
  hook: HookDerivation;
}) {
  return (
    <Card size="sm" className="bg-card/80">
      <CardHeader>
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
          {label}
        </p>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-[var(--color-text)]">
          {hook.primary || "Add more narrative detail to make this usable."}
        </p>
        {hook.overlay.length > 0 && (
          <ul className="space-y-1.5 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-muted)]">
            {hook.overlay.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function RefreshPlaceholder({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-[var(--color-text-muted)]">
      {children}{" "}
      <Link
        href="/icp?mode=refresh"
        className="underline underline-offset-4 hover:text-[var(--color-text)]"
      >
        Refresh onboarding
      </Link>
    </p>
  );
}
