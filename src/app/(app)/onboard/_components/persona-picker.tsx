import Link from "next/link";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";
import { PersonaPickerKeyboard } from "./persona-picker-keyboard";

// SPEC-3 Phase 4.b: persona chooser shown when user_type is NULL and
// no `?template=` is in the URL. Click routes to /onboard?template=X
// which re-enters the page and picks up the resolved template. Does
// NOT write profiles.user_type — per SPEC-3's hard constraint,
// user_type is only stamped at the first successful confirm.

interface PersonaPickerProps {
  isRefresh: boolean;
}

export function PersonaPicker({ isRefresh }: PersonaPickerProps) {
  const refreshSuffix = isRefresh ? "&mode=refresh" : "";
  const jobSearchHref = `/onboard?template=job_search${refreshSuffix}`;
  const icpHref = `/onboard?template=icp_definition${refreshSuffix}`;

  return (
    <FadeIn className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <div className="mb-14">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          Let&apos;s set up your command center.
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground text-pretty">
          Two paths in. You can switch until you confirm.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PersonaCard
          href={jobSearchHref}
          index="01"
          title="I'm looking for my next role"
          description="Score roles, research contacts, draft outreach."
          readout={["Today queue", "scored roles", "drafted outreach"]}
        />
        <PersonaCard
          href={icpHref}
          index="02"
          title="I'm running GTM at a company"
          description="Score accounts, define ICP, run dormant sweeps."
          readout={["Account list", "ICP rubric", "weekly dormant sweep"]}
        />
      </div>

      <PersonaPickerKeyboard jobSearchHref={jobSearchHref} icpHref={icpHref} />
    </FadeIn>
  );
}

function PersonaCard({
  href,
  index,
  title,
  description,
  readout,
}: {
  href: string;
  index: string;
  title: string;
  description: string;
  readout: string[];
}) {
  return (
    <Link
      href={href}
      className="
        group block rounded-xl
        transition-transform duration-150 ease-out
        motion-safe:hover:-translate-y-0.5
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]
      "
    >
      <Card
        size="sm"
        className="h-full ring-foreground/10 transition-[box-shadow] duration-150 group-hover:ring-foreground/25"
      >
        <div className="space-y-2 px-4 pt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-medium tracking-tight">{title}</h2>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {index}
            </span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="mt-1 px-4 pb-4 pt-3">
          <ul className="space-y-1.5">
            {readout.map((item) => (
              <li
                key={item}
                className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
              >
                <span className="text-foreground/30">—</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </Link>
  );
}
