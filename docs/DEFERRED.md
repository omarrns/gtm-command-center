# Deferred backlog — GTM Command Center

Living log of features we've considered, cut, and scheduled for future consideration. Separate from per-SPEC non-goals sections — this is the durable catch-all, so items don't vanish when a SPEC ships.

## How this works

- Each item names what it is, which SPEC/decision deferred it, why, and the trigger that should bring it back into scope.
- Triggers are concrete observables — "3+ users ask for X" beats "when it feels right."
- When we ship something from this list, move it to "Shipped" at the bottom with the SPEC reference and date.
- Don't use this as a wishlist. Only items with a genuine "should we build this" question live here.

## Active deferrals

### Automated GTM account discovery (Exa search adapter)

**What.** Takes `user_scoring_profiles.icp_rubric` + `memory_documents.company_icp`, generates Exa queries (firmographic, technographic, hiring-signal, JTBD, trigger-event), runs them, and upserts matching companies into `opportunities` as GTM target accounts with `source='exa'`, `stage='discovered'`. The rest of the existing pipeline (score → research → enrich → draft → send) handles them via the `user_type`-aware scoring branch.

**Deferred from.** SPEC-3. Originally slotted as Phase 7; cut after product call to prioritise onboarding quality as the v1 wedge.

**Why deferred.** SPEC-3's product bet is that a well-synthesized ICP, grounded in real exemplars with disagreement surfacing and per-exemplar provenance, is itself the product — users get an operationalised rubric grounded in pattern-matching instead of a PDF from a consulting engagement. Discovery is distribution; the onboarding is the wedge. Shipping discovery alongside meant two new surfaces to polish (Exa query generation, GTM scoring branch) with neither getting the attention the onboarding deserves.

**Trigger to revisit.** ICP onboarding has shipped and been used by ≥3 real GTM users who confirmed a rubric AND explicitly asked "how do I find accounts that match this?" If users confirm and don't ask — the product is maybe complete at onboarding, and discovery is a different product.

**Dependencies.** SPEC-3 shipped. `user_scoring_profiles.icp_rubric` populated for real confirmed users. GTM scoring branch exists (also deferred — see below).

**Rough scope.** 3–4 commits: Exa query construction from `icp_rubric` (`src/lib/pipeline/steps/icp-discovery.ts`), `/api/cron/icp-discovery` route handler, dedupe logic against `(user_id, 'exa', domain)`, regression test. Build-spec §6 has the concrete Exa patterns — this is bounded work, not open-ended research.

---

### Manual GTM account entry + scoring branch

**What.** "Add target account" dialog with company name + domain + buyer personas. Inserts into `opportunities` with `source='manual'`, `external_id=domain`, `role_title=null`. `src/lib/pipeline/steps/score.ts` branches on `user_type` — job-seeker users get the existing role-fit scoring; GTM users get scoring against `icp_rubric` (firmographics, technographics, signals, disqualifiers, personas). `OpportunityCard` + detail pages render the GTM-shaped object (no role, company + domain + personas prominent).

**Deferred from.** SPEC-3. Originally Phase 6; cut after product call to keep GTM post-confirm as onboarding-only (no manual entry, no pipeline surface for GTM v1).

**Why deferred.** Manual entry was proposed as a band-aid for the missing discovery adapter — so a confirmed GTM user had something to do. Better call: don't build the band-aid. If discovery isn't in v1, the post-confirm GTM surface is the confirmed ICP rubric itself (rendered statically), not a data-entry form. Keeps the GTM product shape honest — onboarding-as-the-product — rather than pretending there's a pipeline when there isn't.

**Trigger to revisit.** Either (a) automated discovery ships and the scoring branch is needed anyway, or (b) confirmed GTM users ask for a "test my rubric against companies I know" feature with enough volume to matter. The second trigger is weaker than the first — discovery is the forcing function.

**Dependencies.** `user_type` column + `icp_rubric` column in place (will ship with SPEC-3). Migration already adds `company_domain`, `trigger_signals`, `buyer_personas` + relaxes `role_title` to nullable, so the schema is ready even after this defer.

**Rough scope.** 3 commits: add-account dialog + server action, scoring branch in `score.ts` (reads `icp_rubric`, scores by dimension match), `OpportunityCard` GTM label handling. Should be bundled with the Exa discovery work — the scoring branch is required for either source.

---

### Positioning rubric template + dashboard nudge card

**What.** Third `InterviewTemplate` — `positioning_rubric`. Interviews a GTM lead on competitive positioning: product truth, current vs. future advantages, enterprise table stakes, competitors, proof points. Extraction produces a structured rubric (build-spec §9 + reference appendix) stored in a new `positioning_rubrics` table. Dashboard nudge card renders for `user_type === 'gtm'` users with ≥5 scored accounts, offering to define positioning. Routes into the new template.

**Deferred from.** SPEC-3. Originally Phase 8 as a nudge scaffold; cut after product call because the ≥5-scored-accounts trigger can't fire without automated discovery.

**Why deferred.** Two gated dependencies: (a) positioning rubrics without grounded accounts to compare against are aspirational, which is exactly the failure mode the template exists to prevent; (b) the nudge trigger needs a real signal (scored accounts) that doesn't exist in SPEC-3's onboarding-only GTM shape. Shipping the template before discovery means users define positioning in a vacuum — same trap as the consulting-PDF ICPs SPEC-3 pitches against.

**Trigger to revisit.** Automated discovery ships + produces scored accounts for real GTM users + those users start asking "how do I sharpen this against competitors?" OR we add a second GTM persona workflow (competitor research, sales enablement) that needs positioning as input.

**Dependencies.** SPEC-3 shipped. Discovery shipped. ≥1 GTM user with ≥5 scored accounts.

**Rough scope.** Its own SPEC. ~5–7 commits: template module, new `positioning_rubrics` table + migration, proof-point-discipline extraction prompt, rubric review UI (table-shaped, different again from both job_search and ICP), dashboard nudge card + dismissal state, refresh flow. Build-spec §9 has the schema; the reference appendix is the gold standard for structure + specificity.

---

### Post-confirm persona reset + export

**What.** `/settings` switch-persona card with confirmation modal, "Download my data" JSON export, destructive cascade that deletes persona-scoped data (artifacts, memory docs with `origin='onboarding'`, `pipeline_config`, `user_scoring_profiles`, `opportunities`, `watchlist`, `watchlist_alerts`) and resets `profiles.user_type` to NULL. Keeps `gmail_credentials` and app-level settings per SPEC-3's reset table.

**Deferred from.** SPEC-3. Originally Phase 8; deferred to a follow-up cleanup SPEC once the GTM happy path is proven in prod. v1 ships a `<SwitchPersonaPlaceholder>` in `/settings` that shows the current persona and says "Contact support to switch" — sets expectation without building destructive infrastructure before we've seen both personas work.

**Why deferred.** Building destructive delete + export + modal copy + tests before we've seen the flow run end-to-end inverts risk. If we learn something about GTM onboarding in prod that changes the data shape, we'd be refactoring the reset flow to match. Ship the happy paths first, then build the escape hatch.

**Trigger to revisit.** ≥1 user hits the placeholder + asks to switch persona, OR a second persona ships and we genuinely expect users to try both, OR the placeholder creates enough friction (e.g., users email support for a reset) that it's worth automating.

**Dependencies.** Both personas shipped and confirmed for real users. Export JSON schema decided.

**Rough scope.** 3 commits: `switch-persona-card.tsx` replacing the placeholder, `resetPersonaAction` + `downloadUserDataAction` in `settings/actions.ts`, regression test asserting keep/delete table matches SPEC-3.

---

### Multi-contact GTM accounts (multi-threading per account)

**What.** Support multiple contacts per target account (one account → N buyers, each with their own outreach thread + reply tracking). Today's `opportunities.recipient_*` fields are singular (one name, one title, one email, one Gmail thread).

**Deferred from.** SPEC-3 non-goals.

**Why deferred.** The `opportunities` schema with singular recipient fields is a load-bearing simplification. Breaking that invariant needs a separate `contacts` table with FK to `opportunities`, a rewrite of the draft/send/reply stages to operate per-contact, and a new UI for contact selection. Meaningful work — and not required for v1 GTM which scopes to single-contact outbound.

**Trigger to revisit.** Confirmed GTM users running outbound (post-discovery) + explicitly asking to multi-thread inside an account. Low-priority until discovery is shipped.

**Dependencies.** Discovery adapter shipped. Manual + automated account scoring shipped.

**Rough scope.** Its own SPEC. ~6+ commits: `contacts` table migration, draft/send/reply rewrites, per-contact UI, reply-attribution logic.

---

### Cross-persona substrate sharing (one account running both templates)

**What.** A single account running `job_search` AND `icp_definition` concurrently, with memory documents + artifacts shared across both personas. Omar himself is the motivating case — currently job-seeking, will be running GTM at whichever company he joins.

**Deferred from.** SPEC-3 — explicitly rejected as v1 scope.

**Why deferred.** The one-persona-per-account invariant is what lets every downstream surface (sidebar, dashboard, pipeline vocabulary) read `user_type` as a single discriminator. Sharing substrate across personas requires templating every surface against a _set_ of personas — a different architecture. SPEC-3 notes this as "v2 scope once multi-template-within-persona proves stable enough to extend across personas."

**Trigger to revisit.** `icp_definition` + `positioning_rubric` both shipped and stable. Multi-template-within-GTM proven. Then, and only then, consider cross-persona.

**Dependencies.** Both GTM templates shipped. `user_type` as a single-value discriminator stops being load-bearing.

**Rough scope.** Its own SPEC. Likely a substantial rearchitecture — `user_type` becomes `active_personas: string[]`, every persona-branching call site updates.

---

### Archive table for reset data

**What.** When a user resets a persona, instead of hard-deleting `opportunities` + `memory_documents` + `pipeline_config`, copy rows into shadow `archived_*` tables and delete originals. User can restore or reference historical pipeline runs.

**Deferred from.** SPEC-3 non-goals.

**Why deferred.** v1 reset feels like "fresh install." The JSON export button on the reset modal covers the user-held-backup case. Archive tables are a real storage cost + a surface-area increase (restore UI, merge conflicts if the user re-onboards then restores). Not worth it until we see users actually request it.

**Trigger to revisit.** ≥1 user asks to undo a reset, OR the reset flow ships and the "Download my data" button is underused (users would rather have server-side archive than local JSON).

**Dependencies.** Post-confirm reset shipped.

**Rough scope.** 4–5 commits: `archived_*` table migrations, copy-on-delete wrapper, restore action, restore UI, regression tests.

---

### Drop legacy `extracted_*` columns

**What.** `onboarding_interviews` has four JSONB columns — `extracted_profile`, `extracted_search`, `extracted_outreach`, `extracted_insights` — that SPEC-3's Phase 1 replaces with a single `extracted` JSONB column. Phase 1 dual-writes both for rollback safety; this item is the cleanup commit that removes the four legacy columns.

**Deferred from.** SPEC-3 Phase 1.a + 1.b (intentionally deferred to a separate cleanup commit).

**Why deferred.** Don't combine a schema change with a consumer rewrite in the same commit. Phase 1 lands the unified column + dual-writes + rewrites consumers; a separate commit drops the legacy columns once Phase 3 has stabilised in prod. Two weeks of observation is a reasonable floor.

**Trigger to revisit.** Phase 3 (`icp_definition` template) in prod for ≥2 weeks with no rollback. No consumer still reads `extracted_profile` etc. directly (grep the codebase before dropping).

**Dependencies.** SPEC-3 Phase 3 shipped and observed.

**Rough scope.** 1 commit: drop the four columns + remove the dual-write + remove the fallback-reassemble path in `confirm-logic.ts`.

---

### Live SSE stream for orchestrator reasoning

**What.** Real-time streaming of the orchestrator's per-dimension inference to the status panel via SSE (`/api/onboard/orchestrator/stream`), using AI SDK v6 `streamText` with `sendReasoning: true`. Replaces v1's saved-state polling.

**Deferred from.** SPEC-2 Phase 3.

**Why deferred.** SPEC-2 shipped with saved-state polling — status panel renders from `orchestrator_state` and refreshes after artifact ingest + each chat turn. Adequate for v1. Live streaming is an additive change if the current experience feels flat in practice.

**Trigger to revisit.** User feedback that the status panel feels static or delayed, OR the onboarding funnel shows drop-off at the "waiting for orchestrator" transition.

**Dependencies.** SPEC-2 shipped (done).

**Rough scope.** 2 commits: SSE route handler + client subscription; `orchestrator-status-panel.tsx` wires to the stream instead of polling.

---

## Open product questions

Not deferred — these are live decisions we'll need to make, tracked here so they don't get lost.

### Watchlist semantics under GTM

**Question.** The existing Watchlist feature tracks companies-of-interest via Exa Websets (auto-alerts for funding, hires, launches, press, job postings, leadership changes). Under `user_type='gtm'`, is Watchlist (a) the same feature with different empty-state copy, (b) repurposed as "Target account signal monitor" feeding trigger events into `opportunities.trigger_signals`, or (c) hidden entirely until discovery ships?

**Why it matters.** Watchlist is the one existing feature that's genuinely persona-agnostic (company tracking is company tracking). If it survives the GTM fork without modification, the sidebar doesn't need to branch as much.

**Resolution trigger.** Decide during SPEC-3 Phase 6 (sidebar + vocabulary) implementation. Default to (a) for v1 unless (b) proves cheap.

---

### Refresh-mode semantics for GTM

**Question.** `/onboard?mode=refresh` currently re-runs job_search onboarding against existing memory docs. Under GTM, does refresh (a) re-run the full ICP interview with new exemplars, (b) allow editing the confirmed rubric directly without re-interviewing, or (c) both, with a choice at entry?

**Why it matters.** ICP rubrics drift — new customers, new disqualifiers, new signals. Users will refresh more often than job seekers do. The right refresh UX matters more for GTM than it does for job_search.

**Resolution trigger.** After SPEC-3 ships and a real GTM user wants to update their ICP. Decision can wait.

---

### Research enrichment shape for GTM accounts

**Question.** For job_search, research enrichment pulls company research via the research pipeline and attaches `research_id`. For GTM accounts, what's enriched — company financials, tech stack detection, buyer-persona LinkedIn lookup, trigger-event crawl? And is it triggered by scoring (auto-enrich high-scoring accounts) or by user action (click to enrich)?

**Why it matters.** Without research enrichment, GTM scoring is shallow (scores on declared fields + domain only). Research is what makes the ICP rubric earn its keep — "this account matches because of X, Y, Z signals our rubric weights."

**Resolution trigger.** When Exa discovery + manual entry are both shipped and accounts are flowing through scoring. Research shape should be informed by what the pipeline actually produces.

---

## Shipped

Items that started on this list and have since shipped. Populate as we go.

_(empty)_
