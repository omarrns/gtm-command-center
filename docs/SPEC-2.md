# Product spec — Agentic onboarding (Orchestrator + Interviewer)

---

## Context

The current onboarding interview asks the user ~12 open-ended questions to produce a job-search rubric. Most of those questions have answers sitting in the user's resume, LinkedIn, or past work. The interview treats every field as equally unknown and burns the user's scarcest resource — attention — on the obvious before it gets to the non-obvious.

The existing tools that claim to personalize (career platforms, ICP builders, positioning wizards) all share the same shape: a static form or scripted chat that doesn't read what the user already has. Context the user uploaded in one tool is invisible in the next. Every session starts from zero.

## End user

Same wedge as SPEC-1: knowledge workers in active career transition. Narrower here — someone who already has a resume, LinkedIn profile, or prior positioning doc and wants to set up (or refresh) their job-search rubric without re-typing what they've already written down ten times.

## Why this is a problem

The onboarding interview is where trust is won or lost. A tool that asks "what roles are you targeting?" when the user's resume says "GTM Engineer at Inkeep" is signaling that it doesn't read. A tool that instead opens with "I see you've done GTM Engineering at a B2B AI startup — are you looking to stay in AI-infra or does devtools more broadly work?" is signaling that it does.

The deepest failure of the current flow: it extracts what's already known instead of extracting what's only accessible through the user's taste. Taste is scarce. Obvious facts are free. We're spending user attention on free data.

## What it's costing

- Drop-off: users abandon mid-interview because the first 5 questions feel redundant.
- Shallow answers: by question 8 the user is tired, so the non-obvious questions (dealbreakers, outreach taste, what separates a good deal from a great one) get single-line answers.
- Generic rubric: scoring pipeline runs on low-signal inputs → opportunity scoring is mid → pipeline output drifts.
- Wasted LLM calls: Opus extraction over a transcript that was mostly the user restating their resume.
- No compounding: nothing the user uploaded is reused for future templates (ICP, positioning) — each one starts from zero again.

## How a proposed solution could work

A two-agent onboarding flow. User drops artifacts in (URLs we scrape, text paste, files). An **orchestrator** ingests them and holds confidence over every rubric dimension. An **interviewer** talks to the user but only asks about dimensions where orchestrator confidence is below threshold. The orchestrator's reasoning streams live in a side panel so the user can see what's been inferred vs what's being asked.

### Why AI worker agents are needed

Inferring a rubric from mixed-modality artifacts (resume PDF + LinkedIn HTML + freeform paragraph) is synthesis, not extraction — classic LLM territory. Calibrating confidence per dimension requires reasoning over how much evidence each dimension has, which no deterministic pipeline can do. And deciding in real time whether a given question is worth asking the user requires comparing expected information gain against the cost of user attention — a judgment call the orchestrator has to make turn by turn.

The two-agent split matters: the interviewer needs a single mandate (talk to user) and the orchestrator needs a single mandate (hold context + answer questions). Merging them produces an agent that simultaneously tries to be conversational and to reason over a 20-page resume. Both suffer.

### User flow

1. **Drop artifacts.** User pastes URLs, text, or uploads files. Orchestrator ingests asynchronously — scrapes URLs, parses files, normalizes to markdown.
2. **Orchestrator analysis.** Orchestrator produces an initial per-dimension confidence map. Streams its reasoning into a right-side panel as it works.
3. **Interview begins.** Interviewer opens chat. Orchestrator passes it the list of low-confidence dimensions. Interviewer asks one focused, non-obvious question at a time.
4. **Per-turn loop.** User answers → orchestrator updates confidence + dimension values → reasoning panel updates live → interviewer pulls next lowest-confidence dimension.
5. **Completion.** When every rubric dimension crosses the confidence threshold, interviewer wraps. No fixed turn count.
6. **Confirm.** User sees draft rubric with per-field provenance ("inferred from resume line X" / "from your answer in turn 4"). Edits inline. Confirms → writes to memory docs + pipeline_config + scoring profile.

### Insight loops within the product

- **Artifact loop:** every artifact the user drops becomes a `memory_document` (e.g. `user_resume`, `user_linkedin_raw`), usable by future template runs (ICP, positioning) without re-upload.
- **Confidence calibration loop:** when a user edits a field at confirm time, the orchestrator's stated confidence for that field becomes training signal — over time, threshold recalibrates against observed user corrections.
- **Provenance loop:** every field in the rubric carries a source trail. Later skills (draft outreach, score opportunity) can cite provenance back to the user ("scored 92 because your resume shows 3y at Series B and this role is Series B").
- **Non-obvious question loop:** the interviewer's question-selection prompt gets tuned against which questions produced the biggest user edits at confirm. Questions that didn't change the answer get demoted.

The flywheel: each artifact drop compounds into the next template's starting context. Job-search onboarding done well means the ICP interview starts with the user's resume already ingested.

## ROI to users

- Attention reclaimed: interview length collapses from ~12 questions to 3–5 surgical ones.
- Accuracy improved: rubric fields grounded in artifacts, not memory of what the user typed that day.
- Trust earned: user sees the orchestrator's reasoning live — no black box.
- Compounding setup: once a resume is in, it powers ICP + positioning interviews for free.
- Confirm integrity: provenance per field means edits are surgical, not a rewrite.

## Measures of ROI

- **Interview completion rate** — % of users who finish the agentic interview vs the legacy flow. North star.
- **Median question count per interview** — lower is better, floor set by dimension count.
- **Confirm-step edit rate** — % of fields the user changes at confirm. High edit rate on orchestrator-filled fields = confidence miscalibration.
- **Time-to-rubric** — seconds from artifact drop to ready-to-confirm draft. Proxy for perceived speed.
- **Downstream scoring quality** — opportunity scores from agentic-onboarded users vs legacy-onboarded users, measured on reply rate post-send.
- **Artifact reuse rate** — % of users who complete a second template (ICP, positioning) within 30 days; measures whether compounding is real.

## Proposed architecture

**Two agents:**

- **Orchestrator** (Opus). Holds per-dimension confidence map over the active template's rubric schema. Ingests artifacts. Exposes `analyze_artifact`, `get_lowest_confidence_dimension`, `update_dimension`, `check_done`. Streams reasoning to the UI via a separate SSE channel.
- **Interviewer** (Sonnet). Stateless per turn. Receives the next low-confidence dimension + orchestrator's current hypothesis for it. Asks one non-obvious question. Passes user response back to orchestrator.

**Persistence substrates:**

- `memory_documents` gets new keys: `user_resume`, `user_linkedin_raw`, `user_uploaded_artifacts`. Append-only. Reusable across templates.
- `onboarding_interviews.orchestrator_state` (new JSONB column) holds per-dimension confidence + provenance map during the interview. Cleared at confirm.
- Existing `InterviewTemplate` shape gains `rubricSchema: z.ZodType` and `dimensions: Dimension[]` (name + description + confidence threshold).

**Control plane:**

- Artifact ingestion pipeline: Firecrawl for URLs, a file parser for PDF/docx, passthrough for text. Each run produces normalized markdown + writes to `memory_documents`.
- Per-dimension confidence threshold default `0.75`; tunable per template.
- Streaming: orchestrator reasoning uses AI SDK v6 `streamText` with `sendReasoning: true` to a dedicated `/api/onboard/orchestrator/stream` endpoint. Interviewer chat uses the existing `/api/onboard/chat` route.
- Confirm step reuses `performConfirm` in `confirm-logic.ts` — writes memory docs + pipeline_config + scoring profile from orchestrator's final dimension map, same as today's extraction output.

**Data flow per interview:** Artifact drop → ingest + persist to `memory_documents` → orchestrator analyzes + emits confidence map → interviewer pulls lowest-confidence dimension → user answers → orchestrator updates → loop until every dimension ≥ threshold → confirm with provenance.

## What could break or degrade

- **Overconfidence.** Orchestrator marks a dimension confident when it shouldn't be. User never gets asked, wrong value ships. _Mitigation:_ confirm-step edit rate is a first-class metric; recurring edits to a given dimension shift its threshold upward automatically.
- **Underconfidence.** Threshold too high, user still gets asked everything. Pattern collapses back to legacy interview. _Mitigation:_ start at 0.75, monitor question-count per interview, tune per template.
- **Artifact drift.** User pastes a resume from 2019, orchestrator builds rubric on stale data. _Mitigation:_ orchestrator surfaces artifact age where detectable; interviewer's first question is always "this artifact — is it current?"
- **Streaming reasoning noise.** Live reasoning panel exposes internal doubt and looks unstable. _Mitigation:_ the reasoning surface is a summary ("inferred seniority: 4y — high confidence"), not the raw chain-of-thought.
- **Parser failures.** Malformed PDF, JS-heavy LinkedIn page, empty paste. Orchestrator starts with nothing and asks every question anyway. _Mitigation:_ explicit ingestion status per artifact with retry UI; never silently skip a failed artifact.
- **Privacy surface.** Resumes + LinkedIn go into `memory_documents`, reused across templates. _Mitigation:_ per-artifact delete from `/settings`; encryption-at-rest via Supabase defaults; never logged.
- **Two-agent cost.** Opus + Sonnet concurrent per interview. _Mitigation:_ orchestrator only re-runs analysis when a new artifact lands or every N interview turns, not per-turn; interviewer stays on Sonnet.
- **Confidence calibration across templates.** Job-search threshold that works may be wrong for ICP. _Mitigation:_ thresholds live on the template, not global. Phase 2+ templates carry their own defaults.
- **Confirm fatigue.** Provenance-per-field is more to read. _Mitigation:_ collapse by default; expand per-field on click; surface only when orchestrator confidence was borderline.
