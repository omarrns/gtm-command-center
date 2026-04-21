# Product spec — Dual-persona onboarding (Job seeker + GTM team)

---

## Context

The app was built as a single-user job-search tool, but the underlying engine — discover → score → research → enrich → draft → send → track replies — is the exact shape of what a GTM team running account-based outbound already does. Same pipeline, same primitives, different rubric. For a job seeker, opportunities are job posts and contacts are hiring managers. For a GTM team, opportunities are target accounts and contacts are buyers. The engine is persona-agnostic; only the rubric that defines "who matters" changes.

SPEC-2 shipped agentic onboarding for the job-search template. This spec is about forking at onboarding to unlock the second persona without bolting on a mode-switcher, a settings toggle, or a separate product.

## End user

Two personas served by one product:

1. **Job seekers** (existing wedge). Knowledge workers in active career transition. Resume, LinkedIn, past positioning → personal rubric → job-post pipeline.
2. **GTM operators** (new wedge). Founders doing their own GTM, solo GTM hires at Series A–C, small GTM teams running account-based outbound. Deal history, exemplar buyers, website copy → ICP rubric → target-account pipeline.

Both personas share the same shape of problem: fragmented context about who they're pursuing, living in slide decks and half-finished Notion docs, never operationalized into a system that scores every inbound signal against that context.

## Why this is a problem

For GTM teams specifically: the gap between "we know our ICP" and "we have a rubric that scores every account against that ICP" is wide. ICPs today live in decks, not systems. Existing tools are either static form-builders (Apollo filters, Clay columns, Gong ICP modules) that ask the user to articulate criteria abstractly, or consulting engagements that hand over a PDF that nobody operationalizes. Nothing captures an ICP from examples and converts it into a live scoring pipeline.

Worse: forcing GTM teams through the job_search template creates vocabulary soup and wrong data. "Dealbreakers" mean different things when you're scoring a job versus scoring a buyer. "Positioning" for an individual differs from "positioning" for a company. The two personas need to diverge at the onboarding surface, where the vocabulary and rubric shape are decided — not downstream, where it's too late.

## What it's costing

- GTM teams churn on tools that ask them to define ICP abstractly instead of from examples. People pattern-match better than they define.
- The job_search flow, used by a GTM team, produces unusable output — a scoring rubric shaped for individuals scoring jobs, not companies scoring accounts.
- Compounding is blocked: a user can't complete onboarding once and use the same substrate for both their own job search and their company's GTM.
- The product can't expand beyond Omar without a persona fork. The engine scales; the onboarding doesn't.

## How a proposed solution could work

A persona choice at the top of `/onboard` — before any interview starts. Two cards: "For my job search" / "For my company." Choice routes to the right `InterviewTemplate`.

The persona is an **app-wide type discriminator**, not just an onboarding choice. It determines: the homepage layout, what pipeline objects are labeled (jobs vs. target accounts), what "good result" means (interview request vs. sales qualified meeting), sidebar navigation, empty-state copy, relevance rules for watchlist, review UI shape, and scoring normalizer. One field — `profiles.user_type` — is read everywhere downstream. **Critical write-timing rule:** `profiles.user_type` is only written at the first onboarding confirm, not on persona-card click. Pre-confirm, the in-progress template lives on `onboarding_interviews.template_id` and nowhere else — so backing out of a mistaken choice changes zero global state. See "GTM target-account object model" in Proposed architecture for how the `opportunities` table reuses its schema to carry a semantically different GTM object.

### Why AI worker agents are needed

Same reasoning as SPEC-2, with one addition: the ICP extraction task is genuinely harder than job_search extraction. Job_search synthesizes one subject from possibly-conflicting sources (you). ICP does both — extracts facts about the subject (the user's company, declarative ICP statements) AND finds patterns across N exemplar buyers (LinkedIn profiles of representative customers). Pattern-extraction across examples with variance handling is classic LLM territory and can't be done with deterministic rules.

### User flow (GTM persona)

1. **Persona choice.** `/onboard` opens on two cards. Pick "For my company."
2. **ICP artifact drop.** Same ingestion primitives as SPEC-2 (URL paste, text paste, file upload) but reframed around exemplars with labels, not a generic upload. Users can tag each artifact as a _positive example_ ("customer we love"), _negative example_ ("fit we avoid"), _buyer/persona evidence_ (a buyer's LinkedIn), or _company/product context_ (product copy, deck, sales notes). Declarative ICP statements ("we sell to Series A–C devtools") accepted alongside. Multi-modal evidence matters: buyer LinkedIns reveal persona (role, seniority, career path) but rarely company-level ICP (stage, category, buying triggers) — customer company URLs and positioning copy fill that gap. The interviewer surfaces missing evidence types rather than mandating all of them upfront.
3. **Orchestrator runs two jobs concurrently.** Extract facts about the subject (the user's company, declarative ICP statements). Find patterns across N exemplars (common role, seniority, company stage, trigger events; variable attributes excluded).
4. **Interviewer asks only what's still unknown.** Same low-confidence-first loop as SPEC-2. Exemplar-vs-declarative disagreements become the highest-priority questions.
5. **Review screen is a synthesis + comparison surface, not a form.** Job*search review is "confirm facts about one entity (you)." ICP review is a different screen category — it has to show the user \_what the orchestrator synthesized from N heterogeneous inputs* and let them accept, correct, or challenge each layer. See the Review UI section in Proposed architecture for the full section list.
6. **Confirm writes ICP-shaped memory docs + scoring profile + pipeline_config.**
7. **Dashboard nudge for positioning.** After confirm, a dismissable card surfaces once the user has at least 5 accounts scored against the ICP rubric: "Ready to define your positioning against these accounts?" Routes into the `positioning_rubric` template. Five scored accounts is the floor for grounded positioning — fewer than that and the user is still reasoning in a vacuum.

### User flow (Job seeker persona)

Unchanged from SPEC-2. Persona picker → `job_search` → today's flow.

### Reversibility

- **Pre-confirm:** freely reversible. Users can switch persona without losing dropped artifacts or entered text; the worst case is re-running Opus analysis on the same artifacts under a different template prompt.
- **Post-confirm:** fork locks. Switching persona is destructive and explicit. Surfaced only in `/settings` as "Switch persona and reset" with a confirmation modal that names, in plain language, what will be deleted.

#### Reset policy (post-confirm persona switch)

Ambiguity here creates either silent data loss or reluctant abandonment. The policy is one table:

| Data class                                       | Action on reset | Reason                                                                                                                                               |
| ------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onboarding_artifacts`                           | **Delete**      | Template-semantics-coupled (a LinkedIn was tagged `buyer_persona` or `user_resume` depending on template). Cleaner to re-upload than to reinterpret. |
| `orchestrator_state` on `onboarding_interviews`  | **Delete**      | Template-specific inference. Nothing reusable.                                                                                                       |
| `onboarding_interviews`                          | **Delete**      | The row is persona-scoped. Re-onboarding creates a fresh one.                                                                                        |
| `memory_documents` (onboarding-origin)           | **Delete**      | Persona-shaped (`user_profile` means "me" under job_search, nonsensical under GTM). Delete all rows where `origin = 'onboarding'`.                   |
| `pipeline_config`                                | **Delete**      | Search queries, locations, score threshold — all persona-scoped.                                                                                     |
| `user_scoring_profiles`                          | **Delete**      | The rubric itself. Persona-specific by definition.                                                                                                   |
| `opportunities`, `watchlist`, `watchlist_alerts` | **Delete**      | Pipeline output accumulated against the old persona's rubric. Keeping them after a persona switch pollutes the new pipeline with stale scoring.      |
| `gmail_credentials`                              | **Keep**        | User granted Gmail access to the account, not to a persona. Forcing re-OAuth on persona switch is punitive.                                          |
| `profiles` (email, display_name, `user_type`)    | **Keep**        | `user_type` gets rewritten to the new persona; everything else is account-level identity.                                                            |
| App-level settings (theme, timezone, etc.)       | **Keep**        | Orthogonal to persona.                                                                                                                               |

**Export before delete:** v1 offers a "Download my data" button on the confirmation modal that emits a single JSON file (artifacts + memory_documents + pipeline_config + opportunities). Not archived server-side — once the user confirms reset, it's gone from the database. Privacy-friendly default; if the user wants history, they keep the file.

**No archive table in v1.** Archiving raw artifacts in case the user wants cross-persona reuse later is a real v2 conversation (see Cross-persona drift in _What could break_). For v1, keep the substrate clean and make switching feel like a fresh install.

### Insight loops within the product

- **Exemplar pattern loop:** each added exemplar reduces variance on the ICP class description. Rubric quality scales with exemplar count, not interview length.
- **Declarative-vs-evidence loop:** the orchestrator continuously compares what the user says their ICP is against what the exemplars show. Disagreements surface as review flags, not footnotes. The most valuable thing the interviewer can ask is "which of these is actually right?"
- **Positioning-from-pipeline loop:** `positioning_rubric` doesn't ship in onboarding. It waits until the user has real accounts scored against the ICP rubric (v1 threshold: ≥5). Positioning grounded in live scored accounts beats positioning written in a vacuum. A later, stronger trigger (outreach sent + replies observed) can refine the nudge in v2 once the pipeline produces enough of that signal to be representative.
- **Multi-template-within-persona loop:** the constraint is _one persona per account_, not one template. A GTM account is expected to layer templates over time — `icp_definition` first, then `positioning_rubric` after ≥5 scored accounts. Each template reads any prior template's confirmed memory docs as context, so each new one starts smarter. A job seeker account layers differently (refresh flows, not new personas). Later GTM workflows can consume ICP and positioning, but they're out of scope for this spec. Cross-persona substrate sharing (one account running both sides) is v2 scope.

## ROI to users

- **GTM teams:** operationalized ICP without a consulting engagement, grounded in exemplars instead of abstract form fields.
- **Job seekers:** unchanged — no regression in their flow.
- **Shared:** compounding across templates (ICP-done users can layer positioning for free), single product with two first-class flows instead of two separate tools.
- **Expansion:** the product becomes usable by anyone doing outbound — not just Omar.

## Measures of ROI

- **Persona selection distribution** — which fork users pick. Market-fit signal for the GTM side.
- **GTM-side completion rate** — % of GTM selectors who reach confirm. North star for the new persona, mirroring the SPEC-2 metric for job_search.
- **Exemplar count per ICP interview** — median exemplars dropped. Proxy for user engagement with the new ingestion pattern.
- **Declarative-vs-exemplar disagreement rate** — % of ICPs where user-stated criteria disagree with exemplar patterns. High rate = interviewer is earning its keep.
- **Positioning nudge acceptance rate** — % of GTM-confirmed users who complete the positioning template within 30 days. Measures whether Phase 3 compounds.
- **Pipeline output quality by persona** — reply rate per send for GTM accounts vs. job seekers. Signals whether the persona fork produces rubrics the engine can actually use.

## Proposed architecture

**Source of truth:** `profiles.user_type` enum column. Written _only at first onboarding confirm_ — never on persona-card click, never on template switch pre-confirm. Pre-confirm, the in-progress template lives on `onboarding_interviews.template_id`. The app's downstream surfaces (sidebar, dashboard, pipeline vocabulary) read `user_type` exclusively, so they reflect a _confirmed_ persona and are unaffected by a user bouncing between persona cards mid-onboarding.

**Onboarding surface:**

- Persona chooser lands at `/onboard` before any `InterviewTemplate` is instantiated.
- Routing: `/onboard?template=job_search` or `/onboard?template=icp_definition`. Chooser creates (or updates) the active `onboarding_interviews` row with the chosen `template_id` and redirects. Does **not** write `profiles.user_type`.
- `icp_definition` is a new `InterviewTemplate` — same shape as `job_search`, with its own dimensions, system prompt, extraction schema, and `outputs[]` pipeline.
- At confirm: `performConfirm` (already the confirm seam per SPEC-2) additionally writes `profiles.user_type` based on the confirmed template's persona mapping (`job_search → job_seeker`, `icp_definition → gtm`, future `positioning_rubric` inherits the account's existing `user_type` rather than writing a new one).

**GTM target-account object model:**

The `opportunities` table is physically reused — no schema fork — but the object it represents under `user_type = 'gtm'` is semantically a _target account_, not a job opportunity. The minimum concept set for the GTM shape:

| Concept                 | Storage                                                                                                        | Notes                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Target account          | `opportunities.company_name` + new `company_domain` field (nullable today; required under GTM)                 | Company is the primary entity, not a role.                                                                         |
| ICP fit score           | `opportunities.score` (reused)                                                                                 | Same normalized 0–100. Different rubric inputs.                                                                    |
| Fit reasons             | `opportunities.score_components` (reused)                                                                      | "Why this score" breakdown — ICP dimensions instead of role fit.                                                   |
| Buying trigger          | `opportunities.trigger_signals` (new JSONB array) OR derived from linked `watchlist_alerts`                    | e.g. "Just raised Series B"; surfaced on the account card.                                                         |
| Buyer personas          | Array on `opportunities.buyer_personas` (new JSONB) — role titles matching the ICP's `buyer_persona` dimension | Who to target at the account.                                                                                      |
| Target contacts         | `opportunities.recipient_*` fields (reused) for v1 single-contact; multi-contact is v2                         | Scales later to a separate `contacts` table if the product needs multi-threading per account.                      |
| Account research        | `opportunities.research_id` (reused)                                                                           | Same research pipeline; different prompt context.                                                                  |
| Outbound status         | `opportunities.stage` (reused state machine)                                                                   | `discovered → scored → researched → enriched → drafted → queued → sending → sent → replied → skipped` — unchanged. |
| Fields unused under GTM | `role_title`, `job_url`, `job_description`, `job_employment_type`, `job_*_salary`, `job_required_skills`       | Nullable under GTM. Job-shape columns become dead space; acceptable cost for not forking the schema.               |

Two new nullable columns (`company_domain`, `trigger_signals`, `buyer_personas`) land with the GTM fork; everything else is reuse. The sidebar label switches from "Opportunities" to "Accounts" when `user_type === 'gtm'` but the route and table are the same.

**Artifact semantics:**

- v1 taxonomy of `kind` for ICP artifacts: `positive_example` (customer we love), `negative_example` (fit we avoid — defines the negative space of the ICP, as valuable as positives), `buyer_persona` (individual LinkedIn / background evidence), `company_context` (user's own product/deck/sales notes, declarative ICP statements). Deliberately minimal — richer taxonomies (champion vs. economic buyer vs. user; competitor's customer; etc.) can layer in v2.
- ICP template's `systemPrompt(ctx)` pre-contextualizes artifacts based on their label, so the orchestrator never confuses "example buyer" with "the subject."
- Same `/api/onboard/artifacts` ingestion route — persona-agnostic mechanics, template-specific interpretation.
- **Raw artifacts persist across template switches; analysis does not.** The `onboarding_artifacts` table stores normalized markdown — reusable. But `orchestrator_state.dimensions` is a template-specific interpretation and re-runs when the template changes. Switching template pre-confirm keeps the upload, throws away the inference.

**Review UI:**

`ReviewClient` switches on `clientTemplate.id`. The two templates are not variations of the same screen — they are different screen categories.

- **`job_search` review:** a confirmation + edit surface for one subject (you). Today's 4-section layout (Profile / Search Preferences / Outreach / Dealbreakers) is the right shape. Unchanged from SPEC-2.
- **`icp_definition` review:** a _synthesis and comparison_ surface. The user is not confirming facts about one entity — they're accepting, correcting, or challenging the orchestrator's synthesis across N heterogeneous exemplars. Sections, in priority order:
  1. **Declared ICP** — what the user said in the interview or typed as declarative context.
  2. **Inferred ICP from exemplars** — what the orchestrator extracted by pattern-matching across positive examples.
  3. **Common patterns** — attributes every/most exemplars share (these ship as ICP rubric criteria).
  4. **Meaningful variations** — attributes that differ across exemplars (these _don't_ ship as rubric criteria; they're noted as intentional variance).
  5. **Exclusions / not ICP** — extracted from negative examples. Defines the negative space of the rubric.
  6. **Disagreements** — first-class visual treatment where declared ICP conflicts with what exemplars show ("you said Series A–C; 4 of 5 exemplars are seed"). User resolves each one.
  7. **Search + scoring rubric preview** — the operationalized output: "given this ICP, here's what the pipeline will score against." Shown at confirm time so the user sees the system consequence of their edits.
  8. **Per-exemplar breakdown** — collapsible cards showing what the orchestrator read from each exemplar, with provenance. Default collapsed; expand to audit.

Confirm path reuses `performConfirm` with `template.outputs[]` dispatch (already in place from SPEC-2).

**Positioning nudge:**

- Dashboard card rendered when: `user_type === 'gtm'` AND `icp_definition` is confirmed AND `positioning_rubric` is not yet completed AND **at least 5 accounts have been scored against the ICP rubric**. Concrete trigger, not vague "enough signal." Five scored accounts is the minimum volume at which comparing-against-competitors-and-alternatives becomes grounded rather than aspirational. Dismissable; re-appears after 7 days if ignored, then stays dismissed.

**Downstream pipeline changes (Phase 2/3 from CLAUDE.md, load-bearing for this fork):**

- Unified `extracted` JSONB column on `onboarding_interviews`, replacing the 4 job_search-shaped columns.
- Template-aware `isOnboardingComplete` — reads persona + completed templates, not hardcoded memory doc keys.
- Per-template scoring normalizer — ICP-derived rubric populates `user_scoring_profiles` differently than job_search does.
- Sidebar vocabulary reads `user_type` — "Today" queue label, "Watchlist" semantics, "Opportunities" terminology all branch.

## What could break or degrade

- **Persona misclick discovered at review.** User picks the wrong card, goes through the whole ICP interview, and only realizes at the review screen. The write-timing rule (`profiles.user_type` only at confirm) means no downstream surface has forked yet — but the user has spent real time. _Mitigation:_ persona label prominent throughout the interview (header and status panel); "switch persona" link visible on every onboarding screen so the escape is one click, not a settings hunt; artifacts persist across switches so the re-done interview starts from the same raw material.
- **Exemplar scarcity.** User drops only 1–2 LinkedIn profiles. Orchestrator generalizes from insufficient data and emits a confident-looking ICP that's really just one buyer. _Mitigation:_ interviewer asks for more exemplars before generalizing; explicit "need N more to ship a rubric" state, no silent fallback.
- **Declarative-vs-exemplar disagreement ignored.** User says Series A–C but exemplars are all Series D. If we surface it quietly, users miss it and ship a rubric that doesn't reflect reality. _Mitigation:_ disagreements are first-class review concerns with their own visual treatment, not inline footnotes.
- **Phase 2/3 downstream work incomplete at launch.** Persona picker ships, pipeline still runs `job_search`-shaped scoring. Beautiful front door, broken hallway. _Mitigation:_ gate the GTM fork behind the unified extracted column, template-aware completion check, and per-template scoring normalizer landing first.
- **Positioning nudge fatigue.** If the dashboard card pushes `positioning_rubric` too aggressively, it feels like a second onboarding. _Mitigation:_ concrete trigger (ICP confirmed + ≥5 scored accounts) gates first appearance; dismissable; re-appears once after 7 days, then stays hidden.
- **Cross-persona drift.** Users want one account to run both `job_search` AND ICP (Omar himself is both — job-seeking now, running GTM at whichever company he joins). v1 explicitly rejects this: one persona per account. Risk is that users create second accounts and split data. _Mitigation:_ document as a known limitation; revisit in v2 once the multi-template-within-persona substrate proves stable enough to extend across personas. Note: multi-template _within_ a persona (GTM doing ICP + positioning) is the intended path, not the rejected one.
- **Copy mismatch.** "GTM team" alienates founder-solo operators who don't think of themselves as a team. _Mitigation:_ test against "For my company" and "For my job search" / "For myself"; pick based on completion rate, not intuition.
- **Reversal friction.** Users pick wrong persona, complete onboarding, then realize. The destructive-switch UX is correct but may feel punitive. _Mitigation:_ lower the cost of pre-confirm reversal aggressively (artifact persistence across switches) so the post-confirm case is rare; make the `/settings` switch explicit and non-hidden.
