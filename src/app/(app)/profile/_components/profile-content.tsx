import Link from "next/link";
import { ArrowSquareOut, Gear, UserCircleGear } from "@phosphor-icons/react/ssr";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  PipelineConfigRow,
  UserScoringProfileRow,
} from "@/lib/supabase/types";
export type MarkdownSection = {
  title: string;
  body: string;
};

interface ProfileContentProps {
  profileSections: MarkdownSection[];
  positioningSections: MarkdownSection[];
  dealbreakerSections: MarkdownSection[];
  outreachSections: MarkdownSection[];
  insightSections: MarkdownSection[];
  config: PipelineConfigRow | null;
  scoring: UserScoringProfileRow | null;
  hasAnyMemory: boolean;
}

export function ProfileContent({
  profileSections,
  positioningSections,
  dealbreakerSections,
  outreachSections,
  insightSections,
  config,
  scoring,
  hasAnyMemory,
}: ProfileContentProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="The job-search profile, story, criteria, and outreach preferences created during onboarding."
      >
        <Link
          href="/onboard?mode=refresh&template=job_search"
          className={buttonVariants({ variant: "default" })}
        >
          <UserCircleGear size={14} />
          Edit Profile
        </Link>
        <Link
          href="/settings"
          className={buttonVariants({ variant: "outline" })}
        >
          <Gear size={14} />
          Settings
        </Link>
      </PageHeader>

      {!hasAnyMemory && !config && !scoring && (
        <EmptyState
          message="No profile details saved yet"
          hint="Refresh onboarding to rebuild the profile from your latest context."
        >
          <Link
            href="/onboard?mode=refresh&template=job_search"
            className={buttonVariants({ variant: "outline" })}
          >
            <ArrowSquareOut size={14} />
            Edit Profile
          </Link>
        </EmptyState>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <div className="space-y-6">
          <ProfileCard
            profileSections={profileSections}
            positioningSections={positioningSections}
          />
          <StoryCard sections={insightSections} />
          <OutreachCard
            outreachSections={outreachSections}
            dealbreakerSections={dealbreakerSections}
          />
        </div>

        <div className="space-y-6">
          <SearchCriteriaCard config={config} />
          <ScoringSignalsCard scoring={scoring} />
        </div>
      </section>
    </div>
  );
}

function ProfileCard({
  profileSections,
  positioningSections,
}: {
  profileSections: MarkdownSection[];
  positioningSections: MarkdownSection[];
}) {
  const sections = pickSections(profileSections, [
    "Positioning",
    "Career Highlights",
    "Top Proof Points",
    "Technical Tools",
  ]);
  const fallback = pickSections(positioningSections, [
    "Positioning Statement",
    "What Makes Me Distinct",
  ]);
  const visible = sections.length > 0 ? sections : fallback;

  return (
    <SectionCard
      title="Profile"
      emptyMessage="Profile details are missing."
      sections={visible}
    />
  );
}

function StoryCard({ sections }: { sections: MarkdownSection[] }) {
  return (
    <SectionCard
      title="What I heard"
      emptyMessage="Career story insights are missing."
      sections={sections}
    />
  );
}

function OutreachCard({
  outreachSections,
  dealbreakerSections,
}: {
  outreachSections: MarkdownSection[];
  dealbreakerSections: MarkdownSection[];
}) {
  const sections = [
    ...pickSections(outreachSections, [
      "Outreach Tone",
      "What's Worked",
      "What to Avoid",
    ]),
    ...pickSections(dealbreakerSections, ["Green Flags", "Red Flags"]),
  ];

  return (
    <SectionCard
      title="Outreach Preferences"
      emptyMessage="Outreach preferences are missing."
      sections={sections}
    />
  );
}

function SearchCriteriaCard({ config }: { config: PipelineConfigRow | null }) {
  const queries = cleanList(config?.search_queries);
  const locations = cleanList(config?.search_locations);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search Criteria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <MetricGrid
          items={[
            {
              label: "Score threshold",
              value: config ? `${config.score_threshold}` : "Not set",
            },
            {
              label: "Daily send cap",
              value: config ? `${config.daily_send_cap}` : "Not set",
            },
          ]}
        />
        <ChipGroup label="Search Queries" items={queries} />
        <ChipGroup label="Locations" items={locations} />
      </CardContent>
    </Card>
  );
}

function ScoringSignalsCard({
  scoring,
}: {
  scoring: UserScoringProfileRow | null;
}) {
  const groups = [
    { label: "Target Roles", items: cleanList(scoring?.target_roles) },
    { label: "Tools", items: cleanList(scoring?.tool_familiarity) },
    { label: "Preferred Stages", items: cleanList(scoring?.preferred_stages) },
    { label: "Preferred Domains", items: cleanList(scoring?.preferred_domains) },
    { label: "Green Flags", items: cleanList(scoring?.green_flags) },
    { label: "Red Flags", items: cleanList(scoring?.red_flags) },
  ];
  const hasSignals = groups.some((group) => group.items.length > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scoring Signals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasSignals ? (
          groups
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <ChipGroup
                key={group.label}
                label={group.label}
                items={group.items}
              />
            ))
        ) : (
          <MissingSection message="Derived scoring signals are missing." />
        )}
      </CardContent>
    </Card>
  );
}

function SectionCard({
  title,
  emptyMessage,
  sections,
}: {
  title: string;
  emptyMessage: string;
  sections: MarkdownSection[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {sections.length > 0 ? (
          sections.map((section) => (
            <ReadableSection key={section.title} section={section} />
          ))
        ) : (
          <MissingSection message={emptyMessage} />
        )}
      </CardContent>
    </Card>
  );
}

function ReadableSection({ section }: { section: MarkdownSection }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
        {section.title}
      </h3>
      <MarkdownBody content={section.body} />
    </section>
  );
}

function MarkdownBody({ content }: { content: string }) {
  const blocks = content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <div className="space-y-3 text-sm leading-6 text-[var(--color-text)]">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim());
        const bullets = lines
          .filter((line) => /^[-*]\s+/.test(line))
          .map((line) => line.replace(/^[-*]\s+/, "").trim())
          .filter(Boolean);

        if (bullets.length === lines.length) {
          return (
            <ul
              key={`${block}-${index}`}
              className="list-disc space-y-1 pl-5 text-[var(--color-text)]"
            >
              {bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`${block}-${index}`} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function MetricGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-[var(--color-border)] bg-muted/40 p-3"
        >
          <div className="text-xs text-[var(--color-text-subtle)]">
            {item.label}
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChipGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) {
    return <MissingSection message={`${label} are missing.`} compact />;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-subtle)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="muted">
            {item}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function MissingSection({
  message,
  compact = false,
}: {
  message: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "text-xs text-[var(--color-text-subtle)]"
          : "rounded-lg border border-dashed border-[var(--color-border)] bg-muted/30 p-4 text-sm text-[var(--color-text-muted)]"
      }
    >
      {message}{" "}
      <Link
        href="/onboard?mode=refresh&template=job_search"
        className="font-medium text-[var(--color-blue)] hover:underline"
      >
        Edit Profile
      </Link>
    </div>
  );
}

function pickSections(
  sections: MarkdownSection[],
  wantedTitles: string[],
): MarkdownSection[] {
  const byTitle = new Map(
    sections.map((section) => [normalizeTitle(section.title), section]),
  );
  return wantedTitles
    .map((title) => byTitle.get(normalizeTitle(title)))
    .filter((section): section is MarkdownSection => !!section);
}

function cleanList(values: string[] | null | undefined) {
  return (values ?? [])
    .map((value) => value.trim())
    .filter((value, index, arr) => value && arr.indexOf(value) === index);
}

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
