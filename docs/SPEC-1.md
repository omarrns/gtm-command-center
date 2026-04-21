# Product spec — Personal Agent Platform

---

## Context

Modern life produces signal faster than any one person can act on it. Jobs, people, events, ideas, opportunities — all moving in parallel. The best version of any decision requires context most people don't have time to assemble.

Existing tools are one-shot (LinkedIn search, Luma, job boards) or generic feed engines that don't actually know you. Nothing compounds. Every search starts from zero.

## End user

Individuals navigating transitory life goals — job search, career pivot, relocation, community building, learning sprints. They're curious, self-aware, and willing to trade attention for relevance.

Initial wedge: knowledge workers in active career transition. Strong motivation, clear feedback signal, short time-to-value.

## Why this is a problem

Context is fragmented across tools that don't talk to each other. Recommenders learn you slowly and forget quickly. The user carries the cognitive load of remembering what matters *this week* versus *last month*. Life state changes faster than any static tool adapts.

The deepest failure: every existing tool optimizes for the moment of query, not the moment of relevance. Relevance is proactive by nature. Query-based tools structurally can't deliver it.

## What it's costing

- Missed opportunities: jobs surfaced too late, intros never made, events discovered after they happen.
- Cognitive overhead: hours per week re-searching, re-filtering, re-deciding the same things.
- Decision fatigue: high-stakes choices made with partial context.
- Identity drift: goals evolve but tools keep surfacing old-you's preferences.

## How a proposed solution could work

A personal agent platform with a central orchestrator and 2–4 concurrent specialist agents, each running on a cron to proactively surface high-confidence recommendations. Agents mutate as life state shifts. Memory compounds across missions.

### Why AI worker agents are needed

Tasks are open-ended, judgment-heavy, and require synthesis across sources — classic LLM territory. Each surfacing decision needs context no API can provide: beliefs about the user. Agents can mutate focus as life state changes — something static pipelines cannot do.

Cron plus reasoning equals proactive, not reactive. This is the only architecture that moves the cognitive burden off the user instead of rearranging it.

### User flow

1. **Onboard.** User talks to orchestrator. Deep context intake: goals, constraints, history, taste, red flags.
2. **Agent creation.** Orchestrator spawns 2–4 specialist agents. Each gets a focus, skill bindings, and a memory slice. User reviews and approves configs.
3. **Background work.** Agents run on cron. Each cycle: boot (hydrate memory slice, empty scratchpad), run (execute mission, log to scratchpad), flush (promote belief-worthy observations to canonical memory).
4. **Surfacing.** High-confidence outputs push to user via interrupt. Mid-confidence items wait in morning brief. Interrupt budget capped at 2–3/day.
5. **Feedback.** User engages, dismisses, modifies, or ignores. Every action becomes signal. Belief engine updates.
6. **Mutation.** When life state shifts (offer accepted, new focus emerges), orchestrator re-points slots. Beliefs persist. Mission scratchpad wipes.

### Insight loops within the product

- **Per-agent learning loop:** scratchpad → flush → canonical memory → next run hydrates smarter than the last.
- **User feedback loop:** every action → belief update → next surfacing better calibrated.
- **Orchestrator meta-loop:** which configs worked for which focus → future agent configs improve before they even run.
- **Threshold calibration loop:** dismissal rate tunes confidence gate upward; engagement rate tunes it downward.

The flywheel: every interaction produces two outputs, not one — the recommendation AND a belief update. Without the second output, nothing compounds.

## ROI to users

- Time reclaimed: hours per week of searching, filtering, deciding.
- Opportunities captured: surfaced at the right moment, not after.
- Decision quality: choices made with full context instead of partial.
- Cognitive bandwidth: life goals run in background; user stays focused on execution.
- Compounding edge: every month of use makes the agent more useful, raising switching costs structurally.

## Measures of ROI

- **Engagement rate** — % of surfaced items user acts on. North star metric.
- **Time-to-action** — latency between surfacing and user response. Proxy for relevance.
- **Belief velocity** — rate of canonical memory updates per week. Proxy for learning.
- **Goal completion rate** — % of focus missions that reach declared outcomes.
- **Slot utilization** — % of active slots producing weekly engagement vs idle.
- **Retention at 30/60/90 days** — the only metric that captures whether compounding is real.

## Proposed architecture

**Three persistent substrates (never wiped):**

- Canonical memory — beliefs about user, versioned with confidence scores and decay curves.
- Skills library — reusable primitives (fetch, score, compose, research) callable by any agent.
- Orchestrator meta-memory — config-to-outcome history across missions.

**Ephemeral layer (mutates freely):**

- 2–4 agent slots, each with private scratchpad holding mission state.
- Orchestrator allocating, mutating, and retiring slots based on life signals.

**Control plane:**

- Cron scheduler for periodic runs.
- Event triggers for life-state changes (explicit or detected).
- Confidence gate routing outputs to interrupt, pull queue, or morning brief.
- Flush pipeline (separate LLM call) deciding what's belief-worthy vs mission-only noise.

**Data flow per cycle:** Boot → Run → Flush → (optional) Mutation → repeat.

## What could break or degrade

- **Belief rot.** If flush logic promotes noise, canonical memory becomes unreliable. *Mitigation:* separate LLM call for flush decisions, not bolted onto the agent's main loop — prevents self-serving writes.
- **Echo chamber.** Pure personalization narrows surface area over time. *Mitigation:* deliberate novelty injection baked into surfacing policy.
- **Threshold miscalibration.** Too sensitive means spam; too strict means silence. *Mitigation:* self-calibrating threshold based on rolling engagement rate.
- **Orchestrator thrashing.** Mutation triggers fire too often, nothing compounds inside any mission. *Mitigation:* hysteresis — missions stay stable for minimum N days before mutation is eligible.
- **Skill coupling.** Skills designed as finished workflows instead of primitives. *Mitigation:* enforce Lego-brick design in skills library; workflows live in agents, not skills.
- **Context leak.** Agents reading each other's scratchpads cross-contaminates missions. *Mitigation:* per-agent private scratchpads. Only canonical memory is shared.
- **Cold start.** Early users get generic recs with no belief base. *Mitigation:* aggressive onboarding intake; brief-only surfacing until trust is earned.
- **Trust collapse.** One bad surfacing can kill engagement for weeks. *Mitigation:* rationale trail on every output ("why this?") — transparency is the trust anchor, dismissals become teaching signals instead of silent exits.
