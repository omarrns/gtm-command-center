import type { SalesCall } from "./types";

export const MOCK_CALLS: SalesCall[] = [
  {
    id: "1",
    title: "Churn risk: docs search failing — Notion",
    duration: "40m",
    rep: "Sam Torres",
    account: "Notion",
    stage: "Renewal",
    amount: 54000,
    date: "2026-03-09",
    objectionCount: 1,
    painPointCount: 1,
    redFlagCount: 2,
    outcome: "ongoing",
    analysis: {
      summary:
        "6-month customer Notion is at churn risk. Chat widget is performing well — the issue is search result ordering for long-tail how-to queries. Power users (Notion ambassadors) have noticed and are escalating. Renewal in 3 months. Rep committed to solutions engineer call this week and weekly check-ins for 4 weeks. Retrieval configuration fix likely needed.",
      keyInsights: [
        "CHURN RISK: Renewal in 3 months; search quality is the gating issue",
        "Chat widget is successful — protect this win while fixing search",
        "Root cause: likely retrieval metadata configuration, not content quality",
        "Rep committed to solutions engineer this week — must follow through immediately",
      ],
      coachingNotes: [
        "Escalate to CSM and solutions engineering today — do not let this slip",
        "Weekly check-in commitment: schedule recurring invite before end of day",
        "Frame search fix as proactive customer success, not reactive to complaint",
        "If fixed in <4 weeks, use this as a renewal case study showing responsiveness",
      ],
      objections: [
        {
          type: "Other",
          responseRating: "4/5",
          quote:
            "We're at renewal in 3 months. If search doesn't improve, it's harder for me to justify the contract internally.",
          repResponse:
            "Acknowledged directly, committed to solutions engineer this week + monthly check-ins",
        },
      ],
      painPoints: [
        "Search result ordering is off for long-tail how-to queries, frustrating power users",
      ],
    },
    transcript: `Rep: Thanks for jumping on. You flagged search issues last time — where does that stand?
Customer: Chat widget is great honestly. But long-tail how-to searches have strange result ordering.
Rep: Are these users internal or customer-facing?
Customer: Notion ambassadors. Power users. Their feedback reaches our entire team.
Rep: What's the renewal timeline?
Customer: Three months. If search doesn't improve, it's hard to justify the contract internally.
Rep: I'll pull in our solutions engineer this week. I think this is a retrieval metadata config issue.
Customer: Just don't let this slip. I need to see momentum before we talk renewal.`,
  },
  {
    id: "2",
    title: "Churn risk: SLA reporting gaps — Grafana Labs",
    duration: "44m",
    rep: "Marty Kausas",
    account: "Grafana Labs",
    stage: "Renewal",
    amount: 85000,
    date: "2026-03-08",
    objectionCount: 2,
    painPointCount: 2,
    redFlagCount: 2,
    outcome: "ongoing",
    analysis: {
      summary:
        "Grafana Labs engineering team is frustrated that the support widget can't produce SLA compliance reports for internal stakeholders. Two objections surfaced: price-to-value and missing reporting. Follow-through on custom report is critical before renewal.",
      keyInsights: [
        "Reporting gap is blocking internal stakeholder buy-in — this is a political problem, not technical",
        "Engineering lead has escalated to VP — renewal decision is moving up the chain",
        "Competitor Pylon was mentioned as having built-in SLA dashboards",
        "Strong usage data exists; needs to be surfaced proactively to make the value case",
      ],
      coachingNotes: [
        "Send usage report within 24 hours — most important next step",
        "Loop in product team on SLA reporting feature — give Grafana a firm timeline",
        "Prepare a business case deck comparing total support cost before/after",
      ],
      objections: [
        {
          type: "Price",
          responseRating: "3/5",
          quote: "For this price, I expect dashboards, not workarounds.",
          repResponse:
            "Offered to build a custom Looker report from our API — buys time but not ideal",
        },
        {
          type: "Features",
          responseRating: "3/5",
          quote: "Pylon has this built in. Why don't you?",
          repResponse:
            "Acknowledged the gap, committed to escalating to product, offered roadmap call",
        },
      ],
      painPoints: [
        "No native SLA compliance reporting — requires manual export and manipulation",
        "Internal stakeholders demanding dashboards to justify the spend",
      ],
    },
    transcript: `Rep: The renewal is 6 weeks out — what does the internal conversation look like?
Customer: Engineering loves it. But my VP needs ROI data. I can't pull a clean SLA compliance report.
Rep: What format does your VP need?
Customer: Standard SLA dashboard — response time by tier, escalation rate, resolution rate.
Rep: We don't have that natively, but I can build a custom Looker report from our API.
Customer: That's a workaround. Pylon has this built in.
Rep: I understand the frustration. I'll get you a timeline from product and a custom report within 48 hours.
Customer: The numbers need to be presentable, not just accurate. Make it happen.`,
  },
  {
    id: "3",
    title: "Closed Won: Deployment planning — Vercel",
    duration: "35m",
    rep: "Jordan Mills",
    account: "Vercel",
    stage: "Closed Won",
    amount: 72000,
    date: "2026-03-07",
    objectionCount: 0,
    painPointCount: 0,
    redFlagCount: 0,
    outcome: "won",
    analysis: {
      summary:
        "Smooth deployment planning call following contract close. Vercel's platform team aligned on a 3-week rollout plan. No blockers. Two expansion opportunities flagged for Q3.",
      keyInsights: [
        "Deployment on track for April 1 — engineering lead confirmed resourcing",
        "Two expansion signals: mobile SDK interest + potential EU data residency add-on",
        "Executive champion (CTO) remains engaged — strong reference candidate for devtools vertical",
      ],
      coachingNotes: [
        "Send kickoff deck and deployment timeline by EOD Friday",
        "Flag EU data residency interest to product — potential $15K upsell",
        "Schedule QBR for 90 days post-deployment",
      ],
      objections: [],
      painPoints: [],
    },
    transcript: `Rep: Congrats again on the close. Let's talk deployment — what does your team need to hit April 1?
Customer: Mostly the staging environment config and API access for our platform team.
Rep: I'll send the staging setup guide today. Start with internal docs or customer-facing?
Customer: Internal first. We want to test with our docs team before opening up.
Rep: Two to three weeks for the internal pilot, then customer rollout?
Customer: Exactly. Our CTO wants to be on the kickoff call — she's been championing this.
Rep: We'd love that. You mentioned expanding to EU next quarter?
Customer: Yes — we'll need EU data residency. Let me know what that looks like.`,
  },
  {
    id: "4",
    title: "Closed Won: Onboarding kickoff — Retool",
    duration: "40m",
    rep: "Marty Kausas",
    account: "Retool",
    stage: "Closed Won",
    amount: 72000,
    date: "2026-03-05",
    objectionCount: 0,
    painPointCount: 0,
    redFlagCount: 0,
    outcome: "won",
    analysis: {
      summary:
        "Onboarding kickoff went smoothly. Retool's platform team is highly technical and self-sufficient. Internal champion (Priya, Head of Platform) confirmed a 2-week onboarding timeline with expansion potential across 3 additional teams.",
      keyInsights: [
        "Internal champion is Priya (Head of Platform) — keep her engaged throughout onboarding",
        "Team is developer-first — they'll self-serve most config; keep comms technical",
        "Expansion potential: 3 additional product teams could benefit in Q2",
      ],
      coachingNotes: [
        "Send API docs and SDK access to Priya within 24 hours",
        "Schedule technical office hours for week 2 of onboarding",
        "Ask Priya about the 3 additional teams — plant the expansion seed now",
      ],
      objections: [],
      painPoints: [],
    },
    transcript: `Rep: Excited to get started. Who from your team should we loop in?
Customer (Priya): Just me and our two platform engineers. We're self-sufficient.
Rep: Perfect — I'll send API docs and SDK access after this call. Primary use case?
Customer: Internal tooling docs. We have 40 internal tools and the help text is a mess.
Rep: Two weeks feel right for the initial rollout?
Customer: If the API is clean, we'll be live in one.
Rep: Any other Retool teams this could expand to?
Customer: Three come to mind. Let me introduce you once we've validated internally.`,
  },
  {
    id: "5",
    title: "Technical eval: Zendesk AI vs us — Shopify",
    duration: "60m",
    rep: "Riley Park",
    account: "Shopify",
    stage: "Technical Evaluation",
    amount: 180000,
    date: "2026-03-03",
    objectionCount: 0,
    painPointCount: 3,
    redFlagCount: 1,
    outcome: "ongoing",
    analysis: {
      summary:
        "High-stakes technical eval against Zendesk AI. Shopify's platform team ran a head-to-head test on deflection and accuracy. We outperformed on accuracy but Zendesk's native Salesforce integration is a blocker. Rep needs to close the integration gap before the next eval round.",
      keyInsights: [
        "We won on accuracy — Shopify confirmed 34% better answer quality in their eval",
        "Zendesk's Salesforce integration is blocking the decision — it's their CRM system of record",
        "Decision maker is CTO (Sarah Chen) — she's leaning our way but needs the integration confirmed",
      ],
      coachingNotes: [
        "Get SFDC integration timeline from product within 48 hours — this deal hinges on it",
        "Offer a webhook-based bridge as a temporary workaround while native ships",
        "Get Sarah Chen on a product roadmap call — let her hear it directly from our CPO",
      ],
      objections: [],
      painPoints: [
        "No native Salesforce integration — Shopify's CRM and ticketing flow through SFDC",
        "Eval process is prolonged — procurement team is adding requirements mid-cycle",
        "Zendesk relationship is established — switching cost conversation hasn't been addressed",
      ],
    },
    transcript: `Rep: How did the eval go on your end?
Customer (Sarah): Your answer quality was noticeably better — 34% higher relevance on our 200-query test.
Rep: Great. Where are the gaps?
Customer: Salesforce integration is the big one. Zendesk connects natively. You don't.
Rep: We have a webhook bridge today, and native integration is on the roadmap.
Customer: When's native?
Rep: I'm confirming the timeline this week — I want to give you an exact date, not a rough estimate.
Customer: If you close the Salesforce gap, this is yours. That's the honest answer.`,
  },
  {
    id: "6",
    title: "Technical eval: Pylon vs Freshdesk — Hightouch",
    duration: "55m",
    rep: "Marty Kausas",
    account: "Hightouch",
    stage: "Technical Evaluation",
    amount: 38000,
    date: "2026-03-01",
    objectionCount: 2,
    painPointCount: 3,
    redFlagCount: 1,
    outcome: "ongoing",
    analysis: {
      summary:
        "Competitive eval primarily against Freshdesk. Hightouch is a data team — they care deeply about SDK quality and API-first setup. Rep handled the pricing objection but missed an opportunity to showcase the TypeScript SDK live.",
      keyInsights: [
        "Hightouch is API-first — they want to control configuration, not use a UI wizard",
        "Freshdesk SDK documentation was flagged as 'painful' — our TypeScript SDK is the real differentiator",
        "Decision timeline is 3 weeks — they want to go live before end of Q1",
      ],
      coachingNotes: [
        "Schedule a live TypeScript SDK walkthrough with their lead engineer this week",
        "Price objection: offer 10% discount for Q1 close on annual commit",
        "Loop in engineering for a live technical Q&A to build confidence with the dev team",
      ],
      objections: [
        {
          type: "Price",
          responseRating: "3/5",
          quote:
            "Freshdesk is $400/month less. Why pay more for similar functionality?",
          repResponse:
            "Pointed to SDK quality and support SLA — could have quantified the dev-hour cost",
        },
        {
          type: "Features",
          responseRating: "4/5",
          quote: "How does the API handle rate limiting for high-traffic docs?",
          repResponse:
            "Walked through rate limit tiers and burst handling — dev team seemed satisfied",
        },
      ],
      painPoints: [
        "Freshdesk SDK documentation is poor — their dev team lost time on integration",
        "Need API-first configuration — no dashboard-driven setup process",
        "Tight Q1 deadline is creating pressure — any integration delay kills the deal",
      ],
    },
    transcript: `Rep: Walk me through your eval criteria.
Customer (Jake): API quality, TypeScript SDK, and time-to-live. Everything we do is code-first.
Rep: How did we stack up against Freshdesk?
Customer: Better on the API side. But Freshdesk is $400/month less.
Rep: The price difference gets smaller when you factor in dev hours. How long did Freshdesk integration take?
Customer: Longer than it should. Their docs are painful.
Rep: That's where we're different. I'd love to do a live TypeScript SDK walkthrough with your lead engineer.
Customer: Set that up. And how does rate limiting work under traffic spikes?`,
  },
  {
    id: "7",
    title: "Demo: Support deflection ROI — Intercom",
    duration: "46m",
    rep: "Sam Torres",
    account: "Intercom",
    stage: "Demo",
    amount: 120000,
    date: "2026-02-25",
    objectionCount: 1,
    painPointCount: 2,
    redFlagCount: 0,
    outcome: "ongoing",
    analysis: {
      summary:
        "Strong first demo. Intercom's support team was engaged throughout. Rep anchored on deflection ROI and the champion (Marcus) is already building internal consensus. One timeline objection — handled well with an accelerated onboarding offer.",
      keyInsights: [
        "Champion (Marcus, VP Support) is aligned — needs to sell internally to CTO",
        "ROI framing landed well: 20-point deflection increase = ~$200K in support cost savings",
        "Timeline objection was the only friction — 4-week onboarding felt too long",
      ],
      coachingNotes: [
        "Send ROI calculator pre-populated with their numbers within 24 hours",
        "Help Marcus build the internal business case — give him a deck for the CTO conversation",
        "Schedule exec alignment call with CTO directly — don't let Marcus go it alone",
      ],
      objections: [
        {
          type: "Timeline",
          responseRating: "4/5",
          quote:
            "Four weeks to onboard feels long. We need this live by April.",
          repResponse:
            "Offered 2-week accelerated onboarding with a dedicated CS engineer",
        },
      ],
      painPoints: [
        "Current deflection rate (60%) is below benchmark — team is under pressure to improve",
        "Support ticket volume growing 30% QoQ — need deflection to scale without adding headcount",
      ],
    },
    transcript: `Rep: I want to start with your current deflection numbers. What are you at today?
Customer (Marcus): About 60%. Decent, but we're growing fast and need to hit 80 before adding hires.
Rep: That 20-point gap is exactly where we play. Monthly tier-1 volume?
Customer: Roughly 8,000 tickets.
Rep: At 80% deflection, that's 1,600 tickets hitting your team instead of 3,200. About $200K in annual savings.
Customer: That's meaningful. How long does implementation take?
Rep: Standard is 4 weeks. For a deal your size, I can do 2 weeks with a dedicated CS engineer.
Customer: I need to get our CTO aligned. Can you help me make that case?`,
  },
  {
    id: "8",
    title: "Demo: AI agent for Tier 1 deflection — Lattice",
    duration: "48m",
    rep: "Marty Kausas",
    account: "Lattice",
    stage: "Demo",
    amount: 55000,
    date: "2026-02-24",
    objectionCount: 2,
    painPointCount: 3,
    redFlagCount: 1,
    outcome: "ongoing",
    analysis: {
      summary:
        "Demo went well but competing with an internal build-vs-buy debate. Lattice's eng team is evaluating GPT-4 for their own support agent. Rep needs to shift the conversation from build cost to maintenance cost and address the LLM accuracy concern with third-party benchmarks.",
      keyInsights: [
        "Build-vs-buy is the real objection — eng team thinks they can build this in 6-8 weeks",
        "Counter with 12+ months of maintenance — that's where the real cost is",
        "LLM accuracy objection on HR content came up — needs benchmark data, not claims",
      ],
      coachingNotes: [
        "Send build-vs-buy analysis: 6-week build vs. 18-month maintenance reality",
        "Get champion (Sarah, CS Director) to arrange a cross-functional meeting with eng",
        "Address LLM accuracy concern with third-party benchmarks before next call",
      ],
      objections: [
        {
          type: "Build vs Buy",
          responseRating: "3/5",
          quote:
            "Our eng team thinks we can build this in 6-8 weeks with GPT-4. Why pay?",
          repResponse:
            "Raised maintenance cost and iteration time — could have framed build risk more sharply",
        },
        {
          type: "Accuracy",
          responseRating: "3/5",
          quote:
            "How do we know the LLM won't hallucinate on sensitive HR questions?",
          repResponse:
            "Mentioned grounding and citations — should have shown live examples instead",
        },
      ],
      painPoints: [
        "Engineering team is resource-constrained — 6-8 week build estimate will likely slip",
        "CS team lacks credibility with eng to push back on the build decision",
        "LLM accuracy concern is real for HR content — needs proof, not assurances",
      ],
    },
    transcript: `Rep: What prompted you to evaluate support tooling now?
Customer (Sarah): Ticket volume is up 40% since we launched the new performance review module.
Rep: And you're evaluating us against a build option?
Customer: Engineering thinks they can build something with GPT-4 in 6-8 weeks.
Rep: That's 6-8 weeks to ship v1. What's the maintenance plan when docs change or models update?
Customer: I... hadn't thought about that specifically.
Rep: Most teams that build spend 40% of ongoing eng time on maintenance. Let me send you the math.
Customer: How do we know the LLM won't hallucinate on HR questions?`,
  },
];
