import { MOCK_CALLS } from "@/lib/calls/data";
import type { SalesCall } from "@/lib/calls/types";

const LOST_CALLS: SalesCall[] = [
  {
    id: "9",
    title: "Databricks — Enterprise AI Platform Review",
    duration: "52m",
    rep: "Chan Manchanda",
    account: "Databricks",
    stage: "Technical Evaluation",
    amount: 240000,
    date: "2026-02-18",
    objectionCount: 3,
    painPointCount: 2,
    redFlagCount: 3,
    outcome: "lost",
    lossReason:
      "Existing OpenAI enterprise contract (3-year, prepaid) blocked migration via legal",
    analysis: {
      summary:
        "Databricks had a locked-in OpenAI enterprise agreement with 3 years prepaid. Technical eval results were favorable but legal confirmed migration would breach contract terms. Re-engage at renewal in 18 months.",
      keyInsights: [
        "3-year prepaid OpenAI enterprise MSA — migration blocked by legal",
        "Champion (Reza, VP Eng) remains interested — re-engage Oct 2027",
        "Technical eval was positive; performance was not the issue",
      ],
      coachingNotes: [
        "Set re-engage reminder for Oct 2027 (contract renewal window)",
        "Keep Reza warm with quarterly product updates",
      ],
      objections: [
        {
          type: "Contract Lock-in",
          responseRating: "4/5",
          quote:
            "Legal confirmed we'd breach our OpenAI MSA if we migrated any workloads.",
          repResponse:
            "Offered partial workload migration outside MSA scope — creative but legal still blocked",
        },
        {
          type: "Price",
          responseRating: "3/5",
          quote: "We prepaid for 3 years. The sunk cost is real.",
          repResponse:
            "Acknowledged — no counter available on prepaid commitment",
        },
        {
          type: "Risk",
          responseRating: "3/5",
          quote:
            "Switching mid-roadmap introduces risk we can't absorb right now.",
          repResponse:
            "Offered phased migration plan — didn't overcome legal block",
        },
      ],
      painPoints: [
        "Locked into OpenAI contract despite clear performance advantage",
        "Legal risk of migration outweighed technical and cost benefits",
      ],
    },
    transcript: `Rep: How did the technical evaluation score?
Customer (Reza): Latency and throughput are impressive. But legal flagged a problem.
Rep: What kind of problem?
Customer: We have a 3-year enterprise MSA with OpenAI, prepaid. Legal says any migration would be a breach.
Rep: Is there any workload outside the MSA scope we could run on Fireworks?
Customer: Legal is drawing a hard line. I tried.
Rep: When does your OpenAI contract expire?
Customer: 18 months. Call me then.`,
  },
  {
    id: "10",
    title: "Stripe — AI Infrastructure Review",
    duration: "38m",
    rep: "Soumya Srinagesh Tulloss",
    account: "Stripe",
    stage: "Demo",
    amount: 160000,
    date: "2026-02-12",
    objectionCount: 2,
    painPointCount: 1,
    redFlagCount: 2,
    outcome: "lost",
    lossReason:
      "Decided to build in-house on custom GPU cluster — TCO favored internal at their scale",
    analysis: {
      summary:
        "Stripe's infra team sized the total cost of ownership for in-house GPU inference at $90K/year vs $160K on Fireworks. The build-vs-buy decision went internal. At $500M+ ARR, Stripe's ownership culture makes external inference a harder sell.",
      keyInsights: [
        "In-house TCO at $90K/year vs $160K Fireworks — margin was too tight to overcome",
        "Infra team drove the decision, not the ML champion who was aligned",
        "Re-qualify on build-vs-buy culture before deep eval at this company profile",
      ],
      coachingNotes: [
        "Re-qualify on ownership culture before deep eval at $500M+ ARR companies",
        "Next time: engage the infra team directly in the TCO conversation early",
      ],
      objections: [
        {
          type: "Build vs Buy",
          responseRating: "4/5",
          quote: "Our infra team said they can do this in-house for less.",
          repResponse:
            "Countered with hidden costs (engineering time, maintenance) — they had already factored this in",
        },
        {
          type: "Vendor Risk",
          responseRating: "3/5",
          quote:
            "We don't want a critical path dependency on a Series C company.",
          repResponse:
            "Offered SLA and uptime commitments — didn't address the stage concern",
        },
      ],
      painPoints: [
        "Infra team preferred internal ownership over external vendor dependency",
      ],
    },
    transcript: `Rep: Where did the internal evaluation land?
Customer: The ML team loved it. But our infra team did a TCO analysis.
Rep: What did it show?
Customer: At our GPU scale, they can run it in-house for $90K/year. You're at $160K.
Rep: That doesn't account for engineering time, maintenance, and opportunity cost.
Customer: They factored it in. We also don't love a Series C dependency on critical infra.
Rep: We have 99.9% uptime SLAs and enterprise support.
Customer: Appreciate it. We're going internal.`,
  },
  {
    id: "11",
    title: "Figma — AI Feature Expansion Review",
    duration: "29m",
    rep: "Chris Palermo",
    account: "Figma",
    stage: "Discovery",
    amount: 95000,
    date: "2026-02-05",
    objectionCount: 1,
    painPointCount: 2,
    redFlagCount: 2,
    outcome: "lost",
    lossReason:
      "Champion left the company mid-cycle; new owner defaulted to existing Azure OpenAI setup",
    analysis: {
      summary:
        "Figma's Head of AI Product left 3 weeks into the evaluation. The new internal owner had no context on Fireworks and re-started vendor process from scratch, staying with their existing Azure OpenAI setup.",
      keyInsights: [
        "Champion departure is the primary loss driver — deal had momentum before",
        "No multi-thread built — only one internal contact throughout the eval",
        "Azure OpenAI had established trust with the new decision maker",
      ],
      coachingNotes: [
        "Always multi-thread: champion + 1 technical + 1 economic buyer",
        "Identify and engage backup contacts within the first 2 discovery calls",
      ],
      objections: [
        {
          type: "Continuity",
          responseRating: "2/5",
          quote:
            "I just inherited this evaluation. We already have Azure OpenAI set up.",
          repResponse:
            "Tried to re-pitch from scratch — new contact was not receptive without established trust",
        },
      ],
      painPoints: [
        "No internal champion after personnel change",
        "Azure OpenAI already integrated — high switching cost for new owner",
      ],
    },
    transcript: `Rep: Thanks for taking this over from the previous eval. Where are you on the decision?
Customer: Honestly I just inherited this. Our AI infra is on Azure OpenAI already.
Rep: The previous evaluation showed strong latency gains. Did you get a chance to review?
Customer: I looked at it. We'd be ripping out something that works.
Rep: What would it take to continue the evaluation?
Customer: I need to focus on what's in front of me. We'll pass for now.`,
  },
];

export const ALL_CALLS: SalesCall[] = [...MOCK_CALLS, ...LOST_CALLS];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RepStat {
  name: string;
  calls: number;
  wins: number;
  losses: number;
  score: number;
  grade: "A" | "B" | "C" | "D";
  avgObjRating: number | null;
}

export interface CompetitorMention {
  name: string;
  mentions: number;
  accounts: string[];
}

export interface ObjPatternMonth {
  month: string;
  types: Record<string, number>;
}

export interface LossReason {
  account: string;
  rep: string;
  amount: number;
  date: string;
  reason: string;
}

// ─── Computed Data ────────────────────────────────────────────────────────────

// Scores: response quality (70%) + win rate (30%). Pre-computed from mock data.
export const REP_STATS: RepStat[] = [
  {
    name: "Lance N.",
    calls: 2,
    wins: 1,
    losses: 0,
    score: 78,
    grade: "B",
    avgObjRating: 3.5,
  },
  {
    name: "Chan Manchanda",
    calls: 4,
    wins: 1,
    losses: 1,
    score: 65,
    grade: "C",
    avgObjRating: 3.2,
  },
  {
    name: "Soumya Srinagesh Tulloss",
    calls: 3,
    wins: 0,
    losses: 1,
    score: 57,
    grade: "C",
    avgObjRating: 3.4,
  },
  {
    name: "Chris Palermo",
    calls: 2,
    wins: 0,
    losses: 1,
    score: 38,
    grade: "D",
    avgObjRating: 2.3,
  },
];

const KNOWN_COMPETITORS = [
  "OpenAI",
  "Together AI",
  "Replicate",
  "Azure OpenAI",
];

function searchCall(call: SalesCall, term: string): boolean {
  return (
    call.transcript.includes(term) ||
    call.analysis.summary.includes(term) ||
    call.analysis.keyInsights.some((i) => i.includes(term)) ||
    (call.lossReason?.includes(term) ?? false)
  );
}

export const COMPETITOR_MENTIONS: CompetitorMention[] = KNOWN_COMPETITORS.map(
  (name) => {
    const matched = ALL_CALLS.filter((c) => searchCall(c, name));
    return {
      name,
      mentions: matched.length,
      accounts: matched.map((c) => c.account),
    };
  },
)
  .filter((m) => m.mentions > 0)
  .sort((a, b) => b.mentions - a.mentions);

export const MONTH_LABELS: Record<string, string> = {
  "2026-02": "Feb 2026",
  "2026-03": "Mar 2026",
};

export const OBJ_BY_MONTH: ObjPatternMonth[] = (() => {
  const byMonth: Record<string, Record<string, number>> = {};
  for (const call of ALL_CALLS) {
    const key = call.date.slice(0, 7);
    if (!byMonth[key]) byMonth[key] = {};
    for (const obj of call.analysis.objections) {
      byMonth[key][obj.type] = (byMonth[key][obj.type] ?? 0) + 1;
    }
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, types]) => ({ month: MONTH_LABELS[key] ?? key, types }));
})();

// ─── Call lookup helpers (for source modals) ─────────────────────────────────

export const CALLS_BY_COMPETITOR: Record<string, SalesCall[]> =
  Object.fromEntries(
    KNOWN_COMPETITORS.map((comp) => [
      comp,
      ALL_CALLS.filter((c) => searchCall(c, comp)),
    ]),
  );

export function callsForRep(name: string): SalesCall[] {
  return ALL_CALLS.filter((c) => c.rep === name);
}

export function callsForObjType(monthLabel: string, type: string): SalesCall[] {
  const monthKey = Object.entries(MONTH_LABELS).find(
    ([, v]) => v === monthLabel,
  )?.[0];
  if (!monthKey) return [];
  return ALL_CALLS.filter(
    (c) =>
      c.date.startsWith(monthKey) &&
      c.analysis.objections.some((o) => o.type === type),
  );
}

export function callsForLoss(account: string): SalesCall[] {
  return ALL_CALLS.filter((c) => c.account === account && c.outcome === "lost");
}

export const LOSS_REASONS: LossReason[] = ALL_CALLS.filter(
  (c): c is SalesCall & { lossReason: string } =>
    c.outcome === "lost" && !!c.lossReason,
).map((c) => ({
  account: c.account,
  rep: c.rep,
  amount: c.amount,
  date: c.date,
  reason: c.lossReason,
}));
