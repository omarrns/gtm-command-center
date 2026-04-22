import Link from "next/link";
import { Briefcase, Target } from "lucide-react";

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

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight">
          What are we setting up?
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          This decides which interview you&apos;ll get and how results are
          scored. Switching is free until you confirm — after that it requires a
          reset in Settings.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={`/onboard?template=job_search${refreshSuffix}`}
          className="surface p-5 text-left transition-colors hover:border-[var(--color-blue)]"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-blue-muted)]">
              <Briefcase size={16} className="text-[var(--color-blue)]" />
            </div>
            <h2 className="text-sm font-semibold">For my job search</h2>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Find roles, score opportunities, draft outreach. Grounded in your
            resume, LinkedIn, and past positioning.
          </p>
        </Link>

        <Link
          href={`/onboard?template=icp_definition${refreshSuffix}`}
          className="surface p-5 text-left transition-colors hover:border-[var(--color-blue)]"
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-blue-muted)]">
              <Target size={16} className="text-[var(--color-blue)]" />
            </div>
            <h2 className="text-sm font-semibold">For my company</h2>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            Define your ICP from real exemplars — customers you&apos;d want more
            of. Produces a scorable rubric, not a deck.
          </p>
        </Link>
      </div>
    </div>
  );
}
