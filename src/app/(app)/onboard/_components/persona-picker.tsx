import Link from "next/link";

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
    <div className="mx-auto flex min-h-[75vh] w-full max-w-2xl flex-col justify-center px-6 py-12">
      <div className="mb-10">
        <h1 className="text-xl font-semibold tracking-tight text-balance text-[var(--color-text)]">
          What are we setting up?
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--color-text-muted)] text-pretty">
          Shapes your interview and scoring. Switchable until you confirm.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <PersonaCard
          href={`/onboard?template=job_search${refreshSuffix}`}
          title="For my job search"
          description="Find roles, draft outreach."
        />
        <PersonaCard
          href={`/onboard?template=icp_definition${refreshSuffix}`}
          title="For my company"
          description="Define your ICP from exemplars."
        />
      </div>
    </div>
  );
}

function PersonaCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="
        surface relative flex flex-col gap-1.5 p-5
        transition-[transform,box-shadow,border-color] duration-200 ease-out
        hover:border-[var(--color-border-strong)]
        hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]
        motion-safe:hover:-translate-y-0.5
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]
      "
    >
      <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">
        {title}
      </h2>
      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
        {description}
      </p>
    </Link>
  );
}
