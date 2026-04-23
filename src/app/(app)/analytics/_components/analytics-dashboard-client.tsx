"use client";

import { FadeIn } from "@/components/ui/fade-in";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsRow } from "../_loaders/analytics-data";

// Per plan: confirm exact job_salary_period strings from a live JSearch
// response before filtering. Log in discover.ts temporarily if values differ.
const ANNUAL_PERIODS = new Set(["YEAR", "YEARLY", "ANNUAL"]);

const STAGE_ORDER = [
  "discovered",
  "scored",
  "filtered",
  "researched",
  "enriched",
  "drafted",
  "queued",
  "sent",
  "replied",
];

const REMOTE_COLORS: Record<string, string> = {
  Remote: "#22c55e",
  "In-Office": "#3b82f6",
  Unknown: "#94a3b8",
};

function discoveryByDay(rows: AnalyticsRow[]) {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const d = r.discovered_at.slice(0, 10);
    if (new Date(d).getTime() >= cutoff) counts[d] = (counts[d] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function stageFunnel(rows: AnalyticsRow[]) {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
  return STAGE_ORDER.filter((s) => counts[s]).map((stage) => ({
    stage,
    count: counts[stage],
  }));
}

function scoreBuckets(rows: AnalyticsRow[]) {
  const labels = ["0–20", "20–40", "40–60", "60–80", "80–100"];
  const counts = [0, 0, 0, 0, 0];
  for (const r of rows) {
    if (r.score == null) continue;
    counts[Math.min(Math.floor(r.score / 20), 4)]++;
  }
  return labels.map((range, i) => ({ range, count: counts[i] }));
}

function remoteBreakdown(rows: AnalyticsRow[]) {
  let remote = 0,
    inOffice = 0,
    unknown = 0;
  for (const r of rows) {
    if (r.job_is_remote === true) remote++;
    else if (r.job_is_remote === false) inOffice++;
    else unknown++;
  }
  return [
    { name: "Remote", value: remote },
    { name: "In-Office", value: inOffice },
    { name: "Unknown", value: unknown },
  ].filter((d) => d.value > 0);
}

function salaryData(rows: AnalyticsRow[]) {
  const included = rows.filter(
    (r) =>
      r.job_min_salary != null &&
      r.job_salary_currency === "USD" &&
      r.job_salary_period != null &&
      ANNUAL_PERIODS.has(r.job_salary_period.toUpperCase()),
  );
  const labels = ["<50k", "50–100k", "100–150k", "150–200k", "200k+"];
  const counts = [0, 0, 0, 0, 0];
  for (const r of included) {
    const s = r.job_min_salary!;
    const i =
      s < 50000 ? 0 : s < 100000 ? 1 : s < 150000 ? 2 : s < 200000 ? 3 : 4;
    counts[i]++;
  }
  return {
    data: labels.map((range, i) => ({ range, count: counts[i] })),
    includedCount: included.length,
    totalCount: rows.length,
  };
}

function topCompanies(rows: AnalyticsRow[]) {
  const counts: Record<string, number> = {};
  for (const r of rows)
    counts[r.company_name] = (counts[r.company_name] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
}

function topSkills(rows: AnalyticsRow[]) {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    for (const skill of r.job_required_skills ?? []) {
      counts[skill] = (counts[skill] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));
}

export function AnalyticsDashboardClient({ rows }: { rows: AnalyticsRow[] }) {
  const discovery = discoveryByDay(rows);
  const funnel = stageFunnel(rows);
  const scores = scoreBuckets(rows);
  const remote = remoteBreakdown(rows);
  const salary = salaryData(rows);
  const companies = topCompanies(rows);
  const skills = topSkills(rows);

  if (rows.length === 0) {
    return (
      <p className="p-6 text-sm text-[var(--color-text-muted)]">
        No opportunities discovered yet. Run the pipeline to see analytics.
      </p>
    );
  }

  return (
    <FadeIn className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Discovery over time</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ count: { label: "Discovered", color: "#3b82f6" } }}
            className="h-48"
          >
            <LineChart data={discovery}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--color-count)"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stage funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ count: { label: "Roles", color: "#6366f1" } }}
            className="h-48"
          >
            <BarChart data={funnel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ count: { label: "Roles", color: "#8b5cf6" } }}
              className="h-48"
            >
              <BarChart data={scores}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="count"
                  fill="var(--color-count)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Remote breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-48">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                <Pie
                  data={remote}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={80}
                >
                  {remote.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={REMOTE_COLORS[entry.name] ?? "#94a3b8"}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Salary distribution (annual USD)</CardTitle>
          <p className="text-xs text-[var(--color-text-muted)]">
            {salary.includedCount} of {salary.totalCount} roles have annual USD
            salary data
          </p>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ count: { label: "Roles", color: "#f97316" } }}
            className="h-48"
          >
            <BarChart data={salary.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top companies</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer
            config={{ count: { label: "Roles", color: "#06b6d4" } }}
            className="h-64"
          >
            <BarChart data={companies} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                width={76}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top required skills</CardTitle>
        </CardHeader>
        <CardContent>
          {skills.length === 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              No skills data yet — skills populate once the pipeline runs with
              the new fields.
            </p>
          ) : (
            <ChartContainer
              config={{ count: { label: "Roles", color: "#22c55e" } }}
              className="h-64"
            >
              <BarChart data={skills} layout="vertical" margin={{ left: 96 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="category"
                  dataKey="skill"
                  tick={{ fontSize: 11 }}
                  width={92}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  dataKey="count"
                  fill="var(--color-count)"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </FadeIn>
  );
}
