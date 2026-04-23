import type { SalesCall } from "./types";

export const MOCK_CALLS: SalesCall[] = [
  {
    id: "1",
    title: "Notion — Q2 Renewal Check-in",
    duration: "40m",
    rep: "Chan Manchanda",
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
        "Notion AI is on Fireworks serverless tier and hitting p95 latency spikes during US business hours. The writing assistant product is customer-facing — 4-5s responses are visible to end users. Rep committed to modeling dedicated capacity this week. Renewal in 3 months; Together AI was named as the fallback they're actively evaluating.",
      keyInsights: [
        "CHURN RISK: Renewal in 3 months; latency is the gating issue, not cost",
        "Together AI was mentioned by name — they are actively being evaluated",
        "Root cause: shared serverless pool contention during peak US hours",
        "Dedicated deployment would isolate their workload — this is a solvable problem",
      ],
      coachingNotes: [
        "Model dedicated capacity for their traffic pattern and send pricing by EOD Friday",
        "Get a latency SLA in writing — they need something to show leadership",
        "Frame dedicated as the grown-up tier, not an upsell — they've earned it at this volume",
        "If we move them to dedicated, use this as a case study for other AI-native SaaS accounts",
      ],
      objections: [
        {
          type: "Performance",
          responseRating: "4/5",
          quote:
            "Renewal is in 3 months. If the latency doesn't stabilize, I have to look at Together AI.",
          repResponse:
            "Acknowledged the risk, committed to dedicated capacity modeling this week",
        },
      ],
      painPoints: [
        "p95 latency spikes to 4-5s during US business hours on serverless tier — customer-facing",
      ],
    },
    transcript: `Rep: Last time you flagged latency spikes during peak hours — where does that stand?
Customer: Base performance is great. But p95 hits 4-5 seconds during US business hours. Our users notice.
Rep: Are these on the serverless tier or your dedicated capacity?
Customer: Serverless. We spike during work hours — it's a shared resource problem.
Rep: That's exactly why high-traffic products move to dedicated. We can reserve capacity for your workload.
Customer: Renewal is in 3 months. If the latency doesn't stabilize, I have to look at Together AI.
Rep: Let me model out a dedicated deployment for your traffic pattern this week.
Customer: I need to see numbers before we talk renewal.`,
  },
  {
    id: "2",
    title: "Grafana Labs — QBR + Renewal",
    duration: "44m",
    rep: "Soumya Srinagesh Tulloss",
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
        "Grafana Labs uses Fireworks for AI-powered log anomaly detection in their cloud product. Their VP needs per-workspace cost attribution for internal showback to enterprise customers. The Fireworks dashboard aggregates costs at the account level — no workspace-level breakdown exists. Together AI was cited as having this natively.",
      keyInsights: [
        "Cost attribution is a billing/compliance requirement, not a nice-to-have — VP-level pressure",
        "Grafana sells to enterprise; they do showback to their own customers and need the data",
        "Together AI was mentioned as having workspace-level billing built in",
        "Usage data is strong — the value is there, the reporting isn't",
      ],
      coachingNotes: [
        "Send cost API documentation within 24 hours — they can build a report from raw data",
        "Escalate workspace-level billing to product as a P0 request for this segment",
        "Prepare an ROI deck: inference cost vs. on-prem GPU alternative",
      ],
      objections: [
        {
          type: "Features",
          responseRating: "3/5",
          quote:
            "Together AI has workspace-level billing built in. Why don't you?",
          repResponse:
            "Acknowledged the gap, offered API-level cost data as a bridge, committed to product timeline",
        },
        {
          type: "Price",
          responseRating: "3/5",
          quote:
            "For this price, I expect the reporting to be there, not something I have to build.",
          repResponse:
            "Offered to help build the report from cost API — buys time but isn't a real solution",
        },
      ],
      painPoints: [
        "No native workspace-level cost attribution — critical for their enterprise showback model",
        "Finance team is asking questions about the line item — VP needs something presentable",
      ],
    },
    transcript: `Rep: Renewal is 6 weeks out — what does the internal conversation look like?
Customer: Engineering loves the inference speed. But my VP needs per-workspace cost attribution. We do showback to our enterprise customers and can't break it out.
Rep: What granularity does your finance team need?
Customer: Cost per workspace, per model, per day. We're billing our customers based on it.
Rep: We have cost data at the API level you can pull programmatically. I can help you build a report.
Customer: Together AI has this built into their dashboard. Why don't you?
Rep: I hear you — it's a gap. I'll escalate this to product and get you the API docs today.
Customer: The numbers need to be attributable, not just totals. This is a billing requirement.`,
  },
  {
    id: "3",
    title: "Vercel — Deployment Planning",
    duration: "35m",
    rep: "Chan Manchanda",
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
        "Vercel signed for dedicated GPU capacity to power v0 (their AI code generation product), migrating off OpenAI. Using fine-tuned Llama 3.1 70B on Fireworks. Migration planning call — rep confirmed the fine-tuning timeline and flagged two expansion opportunities.",
      keyInsights: [
        "Migration from OpenAI — this is a competitive displacement win worth documenting",
        "Fine-tuned Llama 3.1 70B is the model; they have training data ready",
        "CTO is the executive champion — she drove this decision internally",
        "EU inference is next: expansion to serve their European user base",
      ],
      coachingNotes: [
        "Get the case study conversation started now — momentum is at its peak",
        "EU inference expansion is essentially confirmed — flag to AE team as $15-20K upsell",
        "Introduce CSM to their platform lead before end of week",
      ],
      objections: [],
      painPoints: [],
    },
    transcript: `Rep: Congrats on the close. Let's talk migration — what does your team need to cut over from OpenAI?
Customer: Mostly the fine-tuned model endpoint and latency validation. We need to confirm p99 before we flip traffic.
Rep: I'll send the dedicated endpoint config today. Fresh fine-tune on our infra or migrating a checkpoint?
Customer: Fresh fine-tune. We have the training data ready and want to run it natively on Fireworks.
Rep: Two to three weeks for fine-tune plus validation, then traffic cutover?
Customer: Our CTO wants to be on the readout — she pushed hard for this migration.
Rep: We'd love that. You mentioned EU users in your contract notes — is multi-region next?
Customer: Yes. EU inference for our European traffic. Let me know what that looks like.`,
  },
  {
    id: "4",
    title: "Retool — Onboarding Kickoff",
    duration: "40m",
    rep: "Lance N.",
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
        "Retool is building AI-powered component generation for their platform using Fireworks inference. Champion is Priya (Head of Platform), team is fully self-sufficient. Starting with Mistral 7B base inference, planning to fine-tune once the use case is validated. Three additional internal use cases identified for Q2.",
      keyInsights: [
        "Team is API-first and self-sufficient — minimal hand-holding needed, keep comms technical",
        "Starting with Mistral 7B base; fine-tuning is the natural expansion path",
        "Three additional use cases mentioned — expansion is warm from day one",
        "Cold start performance is the benchmark they care about most — make sure dedicated is smooth",
      ],
      coachingNotes: [
        "Send Python SDK docs and API keys within the hour — they'll be live fast",
        "Check in at day 3 on cold start performance — this is their gating metric",
        "Plant the fine-tuning conversation at the week-2 check-in",
      ],
      objections: [],
      painPoints: [],
    },
    transcript: `Rep: Excited to kick off. Who from your team owns the integration?
Customer (Priya): Just me and two ML engineers. We'll handle the SDK integration ourselves.
Rep: Perfect — I'll send the Python SDK docs and API keys right after this. Base model or fine-tuning first?
Customer: Mistral 7B base to start. We'll fine-tune once we validate the component gen use case.
Rep: Two weeks to initial production traffic?
Customer: If your cold start times are what you claim, we'll be live in one.
Rep: Any other Retool features this could power beyond component generation?
Customer: Three use cases come to mind. Let me validate the first before we talk expansion.`,
  },
  {
    id: "5",
    title: "Shopify x Fireworks — Technical Evaluation",
    duration: "60m",
    rep: "Chan Manchanda",
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
        "Shopify is evaluating Fireworks as an alternative to OpenAI for merchant-facing AI tools (product descriptions, marketing copy). Fireworks is 3x faster and 60% cheaper per token. Blocker: their merchant agent workflows rely on structured function calling and FireFunction needs to be validated on their complex schemas before the decision is made.",
      keyInsights: [
        "Throughput benchmark: 3x faster than OpenAI — they confirmed this internally",
        "Cost: 60% lower per token — the CFO is already aware and supportive",
        "FireFunction (our function calling) must match OpenAI reliability on their schemas",
        "Decision maker is CTO Sarah Chen — leaning toward Fireworks pending function calling validation",
      ],
      coachingNotes: [
        "Send FireFunction eval notebook for their exact schemas today — this is the deal gate",
        "Get an eng-to-eng call on function calling reliability — rep shouldn't be the only voice",
        "Sarah Chen is ready to move — don't let function calling validation drag past 2 weeks",
      ],
      objections: [],
      painPoints: [
        "FireFunction reliability on complex multi-step merchant schemas — unvalidated",
        "Eval process is lengthening — procurement adding requirements mid-cycle",
        "OpenAI relationship is established — internal familiarity is a real switching cost",
      ],
    },
    transcript: `Rep: How did the benchmark come out on your end?
Customer (Sarah): Throughput was impressive — 3x faster than OpenAI on the same prompts. Cost per token is 60% lower.
Rep: Where are the gaps?
Customer: Function calling. Our merchant workflows depend on structured tool use. OpenAI's reliability on complex schemas is better.
Rep: FireFunction handles multi-step tool use — let me run a benchmark on your exact schemas.
Customer: How long has FireFunction been in production?
Rep: GA for two months with multiple enterprise customers. I'll send you the eval notebook today.
Customer: If function calling matches OpenAI reliability on our schemas, this is yours. That's the honest answer.`,
  },
  {
    id: "6",
    title: "Hightouch x Fireworks — Fine-Tuning Eval",
    duration: "55m",
    rep: "Lance N.",
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
        "Hightouch is building a custom SQL generation model fine-tuned on customer data schemas. Evaluating Fireworks vs Replicate. Fireworks wins on fine-tuning speed and inference latency; Replicate is $300/month cheaper on inference. Cold start times on Replicate are disqualifying at 2-3s. Rep needs to close with a live fine-tuning benchmark.",
      keyInsights: [
        "Replicate cold starts (2-3s) are disqualifying — Hightouch needs under 800ms p95",
        "Fine-tuning speed is where we win — their training cycles need to be fast for iteration",
        "Price objection is real but addressable — cold start penalty makes Replicate more expensive in practice",
        "Decision is 3 weeks out — need to move to benchmark this week",
      ],
      coachingNotes: [
        "Set up live fine-tuning benchmark with their ML lead this week — this closes the deal",
        "Quantify the cold start cost: 2s penalty × their request volume = hidden cost > $300/month delta",
        "Annual commit with Q1 close discount handles the price objection cleanly",
      ],
      objections: [
        {
          type: "Price",
          responseRating: "3/5",
          quote:
            "Replicate is $300/month less on inference. Hard to justify the delta.",
          repResponse:
            "Pointed to cold start penalty — could have quantified it more sharply in dollar terms",
        },
        {
          type: "Performance",
          responseRating: "4/5",
          quote:
            "What LoRA rank do you support for fine-tuning, and what's the training time?",
          repResponse:
            "Walked through LoRA rank options and training time benchmarks — ML lead seemed satisfied",
        },
      ],
      painPoints: [
        "Replicate cold starts at 2-3s — disqualifying for their latency SLA requirement",
        "Need fast fine-tuning iteration cycles — model needs to update as customer schemas evolve",
        "Tight Q1 deadline — any delay in the eval kills the deal timeline",
      ],
    },
    transcript: `Rep: Walk me through what you're optimizing for in this eval.
Customer (Jake): Fine-tuning throughput and inference latency. We're training custom SQL generation models on customer data schemas.
Rep: How did we compare to Replicate so far?
Customer: Better fine-tune speed. But Replicate is $300/month less on inference.
Rep: What was their p95 latency on inference?
Customer: 2-3 seconds on cold starts. That's a problem for us — we need under 800ms.
Rep: We have dedicated hot instances — no cold starts. I'll set up a live benchmark on your schemas.
Customer: Do that. And what LoRA rank do you support? What's training time on a 7B model?`,
  },
  {
    id: "7",
    title: "Intercom — Fireworks Demo",
    duration: "46m",
    rep: "Soumya Srinagesh Tulloss",
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
        "Intercom is spending $180K/month on OpenAI for their Fin AI agent and growing 30% QoQ. Fireworks demo showed 75% cost reduction using Llama 3.1 70B at equivalent quality. Champion (Marcus, VP of Engineering) is aligned but needs the CTO bought in before running a shadow eval. Quality bar is CSAT 4.0+ — non-negotiable.",
      keyInsights: [
        "OpenAI spend is $180K/month and growing — the board is already asking questions",
        "75% cost reduction at equivalent quality is the pitch — $135K/month in savings",
        "CSAT floor is 4.0/5 — this is the quality gate for any migration decision",
        "Champion is Marcus (VP Eng) — CTO alignment is the next gate, not the eval",
      ],
      coachingNotes: [
        "Help Marcus build the CTO deck — give him the cost projection and quality data pre-packaged",
        "Shadow eval on a sample of Fin tickets is the right proof — set this up as soon as CTO is in",
        "Frame this as cost resilience, not quality compromise — the board angle matters here",
      ],
      objections: [
        {
          type: "Quality",
          responseRating: "4/5",
          quote:
            "We've seen quality drop-offs when other vendors make the 'equivalent quality' claim.",
          repResponse:
            "Offered shadow eval on their actual tickets to prove quality before any migration",
        },
      ],
      painPoints: [
        "OpenAI spend at $180K/month is unsustainable at their growth rate — board-level visibility",
        "No clear migration path from GPT-4o — engineering team needs a validated playbook",
      ],
    },
    transcript: `Rep: Where does your OpenAI spend land today?
Customer (Marcus): We're at $180K a month and growing 30% QoQ. The board is asking questions.
Rep: That's exactly where we play. At your volume, Llama 3.1 70B on Fireworks gets you equivalent quality at 75% lower cost.
Customer: We've seen quality drop-offs when other vendors make that claim.
Rep: I want to anchor this in your actual data. What's your current CSAT on Fin?
Customer: 4.2 out of 5. We can't drop below 4.0 — that's a hard line.
Rep: Our customers moving from GPT-4o have stayed within 0.1 points. I'll set up a shadow eval on your ticket sample.
Customer: I need to get our CTO bought in first. Can you help me build that case?`,
  },
  {
    id: "8",
    title: "Lattice — Discovery + Demo",
    duration: "48m",
    rep: "Chris Palermo",
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
        "Lattice is building AI features for performance reviews and goal calibration — HR-sensitive content. Considering fine-tuning GPT-4 via OpenAI vs using Fireworks with Llama fine-tuning. Engineering thinks they can fine-tune on OpenAI in 6-8 weeks. Rep needs to counter with cost and iteration speed: Fireworks fine-tuning is 10x cheaper and runs in hours.",
      keyInsights: [
        "OpenAI fine-tuning is 10x more expensive and takes days vs hours on Fireworks",
        "Build vs fine-tune debate — eng is focused on the initial build, not the iteration cost",
        "HR content hallucination concern is legitimate — needs constrained output demonstration",
        "Champion is Sarah (CS Director) — eng team isn't bought in yet, needs a technical bridge",
      ],
      coachingNotes: [
        "Send fine-tuning cost comparison: OpenAI fine-tune vs Fireworks LoRA on equivalent data",
        "Arrange an eng-to-eng call on constrained output and hallucination guardrails",
        "Offer a free fine-tuning trial on a sample of their performance review data",
      ],
      objections: [
        {
          type: "Build vs Buy",
          responseRating: "3/5",
          quote:
            "We're planning to fine-tune GPT-4 through OpenAI's API. Why pay for Fireworks?",
          repResponse:
            "Pointed to cost and iteration speed — could have quantified the OpenAI fine-tuning bill more sharply",
        },
        {
          type: "Quality",
          responseRating: "3/5",
          quote:
            "How do we know a fine-tuned Llama won't hallucinate on sensitive HR content?",
          repResponse:
            "Explained constrained output API — should have shown a live demo instead of describing it",
        },
      ],
      painPoints: [
        "OpenAI fine-tuning is expensive and slow — iteration cycles will bottleneck product velocity",
        "HR content hallucination is a compliance and trust risk — needs proof before eng will move",
        "CS team lacks technical credibility with eng to advocate for Fireworks internally",
      ],
    },
    transcript: `Rep: What AI features are you trying to ship first?
Customer (Sarah): Performance review summarization and goal calibration suggestions. Sensitive HR content.
Rep: And you're considering fine-tuning OpenAI vs using Fireworks?
Customer: Engineering wants to fine-tune GPT-4. They think it'll take 6-8 weeks.
Rep: Fireworks fine-tuning is 10x cheaper than OpenAI and runs in hours, not days. That's a meaningful difference for iteration speed.
Customer: How do we know a fine-tuned Llama won't hallucinate on sensitive HR content?
Rep: We have a constrained output API that bounds responses to your rubric. I'll show you a live demo.
Customer: What's the per-token cost delta between a fine-tuned model and the base model?`,
  },
];
