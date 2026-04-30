# GTM Narrative Arc — Build Roadmap

## What this doc is

A sequenced build plan for the next round of Growth-side product work. Captures four connected builds, their dependencies, and trigger conditions. Lives upstream of formal SPECs — when #1 is ready to start, the relevant sections lift into `docs/SPECS/SPEC-4.md` with full context/why-this-is-a-problem/proposed-architecture sections matching SPEC-3 conventions.

## Product context

GTM Command Center is a dual-direction autonomous agent. SPEC-2 shipped the job-seeker direction; SPEC-3 forked at onboarding to add the GTM/Growth direction on top of the same engine — discover → score → research → enrich → draft → send → track replies. For job seekers, opportunities are job posts and contacts are hiring managers. For Growth users, opportunities are target accounts and contacts are buyers. Same pipeline, different rubric.

The GTM direction's onboarding produces a structured ICP rubric (firmographics, technographics, signals, disqualifiers, personas) plus a `pipeline_config` and a `scoring_profile`. Today, that rubric is the entire GTM product surface post-confirm.

## The gap we're closing

The ICP rubric tells Growth users **who** to target. It does not tell them **why** that buyer is in pain right now, what they tried before nothing worked, what stakes they're facing, or what changes when they buy. Today that story exists in the user's head, in scattered call recordings, in half-finished Notion docs. It is never operationalized into a system artifact the way the ICP rubric now is.

Without that story, every downstream artifact a Growth user writes — cold-email opener, landing hero, ad concept, sales talk track, blog angle — is reinvented from scratch. They drift apart: the cold email pitches one angle, the landing page pitches another, the ad concept invents a third. There is no canonical source of buyer truth they can pull from.

This is the same shape of problem SPEC-3 solved one layer up. ICPs lived in decks, not systems; SPEC-3 converted them into a live scoring profile. The buyer's pain story is the next layer: convert it from tribal knowledge into a structured, editable, AI-readable artifact that grounds every piece of content the user writes downstream.

## Why this matters for Growth users specifically

Growth marketers in scope (founders running their own GTM, solo Growth hires at Series A-C, small Growth teams) spend most of their day translating "why our product matters" into channel-specific content. The bottleneck is not channel mechanics. It is the absence of a single grounded source of buyer truth that all those artifacts can pull from.

The job-seeker direction already has this loop. `INSIGHTS_SYSTEM_PROMPT` generates a personal narrative (career_narrative, decision_drivers, strongest_stories) at end-of-onboarding, the user reviews and edits it, and downstream outreach prompts pull from it. The GTM direction skips that phase entirely (audit below). This roadmap closes that asymmetry and then connects the resulting artifact into outreach, a unified messaging hub, and content brief generation.

## What we're building

Four connected builds, sequenced in the next section:

1. **ICP Narrative Arc** — Generate the buyer's pain story at the end of GTM onboarding, mirroring the job-seeker `story_review` phase. **The trunk.**
2. **Story-grounded outreach** — Wire the arc into existing GTM outreach prompt builders so cold-email drafts open on the buyer's actual trigger event and stakes, not generic role-mention.
3. **Messaging system hub** — A `/messaging` page that unifies ICP + narrative arc + proof points + disqualifiers + sample hooks per channel. One working canvas for content writing.
4. **Content brief studio** — Channel-specific briefs (blog angle, landing hero, ad concept) generated from the arc. Conditional on #2 not solving the "generic content" problem on its own.

The compounding effect: the user onboards once, gets a grounded ICP plus a grounded buyer story, and every downstream piece of content the system helps them produce traces back to that single source. Consistency across channels stops being a discipline problem and becomes a default of the system.

## Audit baseline (current state)

Confirmed asymmetry between job_seeker and gtm onboarding directions:

- Job seekers: `INSIGHTS_SYSTEM_PROMPT` ([src/lib/onboarding/story-prompt.ts:1-27](src/lib/onboarding/story-prompt.ts)) → `story_review` status → [story-reader.tsx](<src/app/(app)/onboard/_components/story-reader.tsx>) renders career_narrative, decision_drivers, strongest_stories.
- GTM users: ICP template ([src/lib/onboarding/templates/icp-definition.ts:360](src/lib/onboarding/templates/icp-definition.ts:360)) has no `insightsSchema`. [review-icp.tsx:34](<src/app/(app)/onboard/_components/review-sections/review-icp.tsx:34>) explicitly comments "No story phase — icp_definition's template lacks an insightsSchema so review → confirm goes directly."
- Post-onboarding GTM lands on `/icp` with editable rubric + a "Find my accounts" CTA. No narrative surface, no messaging hub, no content brief tooling.

The ICP rubric is necessary but not sufficient. Growth marketers need the buyer's story to ground every piece of messaging they write afterward.

## Sequencing

| Phase | Builds                                        | Mode        | Gate                                              |
| ----- | --------------------------------------------- | ----------- | ------------------------------------------------- |
| 1     | #1 ICP Narrative Arc                          | Solo        | None — this is the trunk                          |
| 2     | #2 Story-grounded outreach + #3 Messaging hub | Parallel    | Phase 1 shipped + dogfooded for ≥3 days           |
| 3     | #4 Content brief studio                       | Conditional | #2 shipped and outreach drafts still feel generic |

Why this order:

- #1 is the foundation. Schema shape (which narrative beats actually matter) won't be right until the first arc is read and critiqued. Building #2/#3 against an unsettled schema is rework.
- After #1 lands, #2 (prompt infra) and #3 (new route + display layer) touch different code paths and can ship in parallel.
- #4 is gated on whether #2 actually fixes the "generic outreach" problem. If outreach feels grounded after #2, #4 is solving a problem that no longer exists.

---

## Build #1 — ICP Narrative Arc

**What.** After GTM ICP confirm, generate a story-shaped doc that captures the buyer's pain in narrative form. Stored as a `memory_document`, rendered in a new GTM-side reader screen mirroring the existing job-seeker `story-reader`.

**Beats to extract** (working list — refine after first dogfood read):

- **Trigger** — what changed in the ICP's world that broke the status quo (regulatory shift, growth stage, new exec, tool sprawl, headcount freeze).
- **Failed workarounds** — what they tried first (hire a contractor, stretch the existing stack, ignore it).
- **Stakes** — cost of inaction in their language (board pressure, churn, missed quota, personal credibility).
- **Aha** — the moment they realize this is a _category_ problem, not a tooling problem.
- **Decision criteria** — what they actually evaluate on, plus what they say but don't mean.
- **Identity shift** — who they become with the solution (the hero version of themselves).

**Why it matters.** This becomes the single grounded story every downstream artifact (#2, #3, #4) pulls from. Without it, the ICP rubric describes targets but not why those targets buy.

**Scope.**

- New prompt builder in `src/lib/skills/prompts/` — accept `SenderIdentity` per CLAUDE.md rule.
- New Zod schema (e.g., `IcpNarrativeArcSchema`) in `src/lib/onboarding/insights-schema.ts` or a sibling.
- Add `insightsSchema` to ICP template at [src/lib/onboarding/templates/icp-definition.ts:360](src/lib/onboarding/templates/icp-definition.ts:360).
- State machine wiring: `review` → `story_review` → `confirmed` for GTM template. Mirror the job_seeker transition in [review-icp.tsx](<src/app/(app)/onboard/_components/review-sections/review-icp.tsx>) (replace direct confirm with `startStoryPhaseAction` analog).
- New reader component (or generalize `story-reader.tsx` if asymmetric beats don't break the layout — read the file before deciding).
- Persist to `memory_documents` with key `icp_narrative_arc` (compare to job-seeker's `interview_insights`).
- Dashboard surfacing — link from `/icp` page so confirmed users can re-read or edit.

**Dependencies.** None — all primitives exist.

**Out of scope for #1.** Outreach prompt integration. Messaging hub. Content briefs. Just generate, store, render, edit.

**Done when.** A confirmed GTM user finishes onboarding, sees a narrative arc that they recognize as their actual buyer's story, can edit it, and the doc lives in `memory_documents` for downstream use.

---

## Build #2 — Story-grounded outreach

**What.** Extend the GTM outreach prompt builders so cold-email drafts pull narrative beats (Trigger, Stakes) from the `icp_narrative_arc` memory_document. Replaces the generic "Hi {firstname}, noticed {company} is hiring SDRs" opener with one that cites the trigger event and stakes from the buyer's world.

**Why it matters.** The whole point of #1 is to operationalize the story. If the arc only lives in a reader screen, it's a vanity doc. #2 is what makes the arc earn its keep.

**Scope.**

- Audit existing GTM outreach prompt builders in `src/lib/skills/prompts/`. Identify which call sites compose cold-email drafts for GTM accounts.
- Inject narrative beats into the prompt context (likely via `extractSenderIdentity` analog or a new `extractIcpNarrative(ctx)` helper).
- Update the prompt template to weave Trigger + Stakes into the opening line guidance — not as variables to interpolate, but as context the model uses to write a grounded opener.
- Regression-test against fixture accounts. Compare drafts before/after to confirm the model is actually using the beats.

**Dependencies.** #1 shipped. `icp_narrative_arc` memory_documents populated for the test user.

**Out of scope for #2.** Touching job-seeker outreach (already grounded by `interview_insights`). Variant generation. A/B copy testing.

**Done when.** Cold-email drafts for discovered GTM accounts visibly cite the buyer's trigger event or stakes, and the change traces to a test fixture diff.

---

## Build #3 — Messaging system hub (`/messaging`)

**What.** A central page that unifies ICP rubric + narrative arc + proof points + disqualifiers + sample hooks per channel (cold email opener, landing hero variants, ad concept seeds, sales talk-track snippets). Pure display layer pulling existing data into one canvas.

**Why it matters.** Today these artifacts are scattered: ICP rubric on `/icp`, proof points buried in onboarding outputs, narrative arc (post-#1) on a reader screen. Growth marketers want one place to think on. Treat it as a working canvas, not a settings page.

**Scope.**

- New route `/messaging` (App Router page).
- Sections: ICP summary card, Narrative arc summary, Proof points, Disqualifiers, Hooks-by-channel.
- Read-only against `memory_documents` and `user_scoring_profiles`. No new mutations beyond what already exists on `/icp`.
- Sidebar nav entry (gated to `user_type === 'gtm'`).
- Empty-state copy if narrative arc isn't generated yet — link back to onboarding story phase.

**Dependencies.** #1 shipped (otherwise the hub is half-empty and confusing).

**Out of scope for #3.** New AI generation. Editing surfaces beyond what already exists per artifact. Cross-artifact diffing or versioning.

**Done when.** A confirmed GTM user can open `/messaging`, see all five sections populated from their actual onboarding outputs, and use it as the reference doc when writing a blog post or landing page elsewhere.

---

## Build #4 — Content brief studio (conditional)

**What.** Given narrative arc + a target channel (blog post, landing hero, ad concept, sales one-pager), generate a content brief. Output is a structured brief — angle, hook, supporting beats, CTA — not finished copy.

**Why it matters.** Closes the loop on "grounding foundation for future content." Growth marketers stop reinventing the angle every time they sit down to write.

**Trigger to build.** Only after #2 ships AND outreach drafts still feel generic OR users explicitly ask for help drafting non-email content. If #2's prompt-grounding fix already feels like the buyer's story is showing up in the work, #4 is over-engineering.

**Scope (rough — defer details until trigger fires).**

- Channel-specific brief prompts in `src/lib/skills/prompts/`.
- Studio route under `/messaging/briefs/new` or similar.
- Inputs: channel selector, optional topic seed, optional reference URL.
- Output: editable brief stored as `memory_documents` with key `content_brief_<channel>_<timestamp>`.

**Out of scope for #4.** Drafting finished copy. Multi-variant generation. Publishing integrations.

**Done when.** Trigger conditions met, then revisit scope.

---

## Open questions to resolve during #1

These don't block starting #1, but they need answers before it ships:

- **Beat list.** The six beats above are a hypothesis. After the first arc is generated and read, prune or rename. Don't lock the schema until at least three real arcs have been read end-to-end.
- **Editability.** Job-seeker `story-reader` is editable. ICP narrative arc should match — Growth users will want to refine the trigger and stakes language to match their actual buyer interviews.
- **Refresh semantics.** Can the user regenerate the arc after editing the ICP rubric? Probably yes — but that's a downstream call. For #1, ship one-shot generation at confirm.
- **Reuse vs. duplicate the reader component.** `story-reader.tsx` is 99 lines and section-driven. If GTM beats are visually identical (title + rich text), generalize. If they need callouts (e.g., quoted buyer language), fork. Read the file before deciding.

## What this is NOT

- Not a full SPEC. When #1 is ready to start, lift the relevant section into `docs/SPECS/SPEC-4.md` with proper context/why-this-is-a-problem/proposed-architecture sections matching SPEC-3 conventions.
- Not a deferred-backlog entry. These builds are scheduled, not parked. If the sequencing changes or any of #2-#4 get cut, move them to [docs/DEFERRED.md](docs/DEFERRED.md) with a trigger-to-revisit.
- Not user-facing copy. Internal planning only.
