# ICP Interview — TDD Test Script (ideal-behavior contract)

## Goal

One new test script at `scripts/test-icp-interview.ts` that pins the deterministic contracts for the ICP interview flow. Two jobs:

1. **Drive out the edit-divergence bug** (audit finding #1) by red-green assertion — not by code reading.
2. **Lock in the pure-logic behavior** (scarcity clamp, computeNextKey, disagreement detection, adapter coercion) so future refactors can't silently break it.

When the script is green, the feature is "done right" for the deterministic 80% of the surface. The LLM-in-the-loop seams (`analyzeArtifacts` Opus call, `updateDimensionFromAnswer`, the streaming wrap-up) stay out of scope — those want fixture-replay tests, separate ticket.

## Invocation

```
npm run test:icp-interview
```

Pattern matches `test-icp-confirm.ts`: dotenv + service-role client + user resolution by email + full reset at start + restore-to-job_seeker at end. Single-user test suite — safe to run against the dev DB.

## Scope

- **In:** deterministic behavior — pure functions + confirm-path DB writes + persona preflight + idempotency.
- **Out:** live Opus calls, full-flow (artifact → chat → review), UI rendering. Those go in their own scripts.

## Contracts

### C1 — User edits reach BOTH memory docs AND `icp_rubric` (drives the fix)

This is the bug. Currently `performConfirm` renders memory docs from the `edits` parameter (fresh) but the ICP normalizer reads `interview.extracted` from the DB (stale). C1 asserts that every top-level section the user edited in the review UI lands in both outputs.

**Setup.** Seed a review-state interview where `extracted = A` and `edits = B` differ on every branch:

```ts
A.product.category = "AI SDR agent";
B.product.category = "Revenue intelligence platform";

A.icp.firmographics.industries = ["devtools"];
B.icp.firmographics.industries = ["vertical-saas", "healthtech"];

A.icp.disqualifiers = ["Enterprise-only"];
B.icp.disqualifiers = ["PLG-only", "< $10M ARR"];

A.proof_points.existing_customers = ["Acme"];
B.proof_points.existing_customers = ["Beta Corp", "Gamma Inc"];
```

Call `performConfirm(svc, userId, interviewId, B)` then assert against the DB.

**Memory doc assertions** (pass on main — regression lock):

- [ ] `company_icp.content` contains `"Revenue intelligence platform"`
- [ ] `company_icp.content` contains `"vertical-saas"` and `"healthtech"`
- [ ] `company_icp.content` does NOT contain `"devtools"` (edit overrides)
- [ ] `icp_disqualifiers.content` contains `"PLG-only"` and `"< $10M ARR"`
- [ ] `icp_disqualifiers.content` does NOT contain `"Enterprise-only"`
- [ ] `icp_proof_points.content` contains `"Beta Corp"` and `"Gamma Inc"`

**Rubric assertions** (FAIL on main — drive the fix):

- [ ] `icp_rubric.product.category === "Revenue intelligence platform"`
- [ ] `icp_rubric.firmographics.industries` includes `"vertical-saas"`, `"healthtech"`
- [ ] `icp_rubric.firmographics.industries` does NOT include `"devtools"`
- [ ] `icp_rubric.disqualifiers` includes `"PLG-only"`
- [ ] `icp_rubric.disqualifiers` does NOT include `"Enterprise-only"`
- [ ] `icp_rubric.proof_points.existing_customers` includes `"Beta Corp"`, `"Gamma Inc"`

### C2 — Exemplar scarcity clamp (pure)

Requires exporting `applyIcpExemplarScarcityClamp` from `src/lib/onboarding/orchestrator/run.ts` (tiny code change — already done for `countPositiveExemplars`, same pattern).

**Count gating:**

- [ ] count=0 + firmographics 0.8 → stays 0.8 (declarative-only mode, clamp short-circuits)
- [ ] count=1 + firmographics 0.8 → clamped to 0.6
- [ ] count=2 + firmographics 0.8 → clamped to 0.6
- [ ] count=3 + firmographics 0.8 → stays 0.8 (pattern threshold reached)

**Idempotence on already-low values:**

- [ ] count=1 + firmographics 0.4 → stays 0.4 (already below cap)
- [ ] count=1 + firmographics 0.6 → stays 0.6 (at cap, no-op)

**Dimension allow-list:**

- [ ] count=1 + product 0.8 → stays 0.8 (product not in ICP_EXEMPLAR_DERIVED_DIMENSIONS)
- [ ] count=1 + buyer 0.8 → stays 0.8 (buyer not in list)
- [ ] count=1 + technographics/signals/proof_points at 0.8 → all clamped to 0.6

**Status re-derivation after clamp:**

- [ ] count=1, firmo conf=0.8, threshold=0.75, pre-status='inferred' → post-status='needs_question' (0.6 < 0.75)
- [ ] count=1, signals conf=0.8, threshold=0.5, pre-status='inferred' → post-status stays 'inferred' (0.6 >= 0.5)

**Summary mutation:**

- [ ] Post-clamp summary includes `"only 1 positive exemplar"` suffix (count=1) or `"only 2 positive exemplars"` (count=2)

### C3 — `computeNextKey` / `nextDimensionToAsk` (pure)

- [ ] Empty state, 7-dim ICP template → returns `"product"` (first)
- [ ] All dims at confidence >= threshold → returns `null`
- [ ] All dims at status='answered' (even if confidence < threshold) → returns `null`
- [ ] One dim at needs_question, rest above threshold → returns the needs_question dim
- [ ] `askedDimensionKeys=['product','product']` → skips product, picks next below-threshold dim (2-ask cap)
- [ ] `askedDimensionKeys=['product']` → can still pick product if below threshold (not yet capped)
- [ ] Two below-threshold dims → returns first in template iteration order

### C4 — `toIcpConfirmEdits` shape coercion (augment)

Existing tests cover malformed tuple fallback + partial product + array-for-buyer-object. Add:

- [ ] State has `product={category, core_jtbd, wedge, __extra: "x"}` → extras stripped, three fields preserved
- [ ] State entirely missing firmographics key → defaults `{industries:[], min:0, max:10000, stages:[], geographies:[]}`
- [ ] State has `signals.hiring_roles = "not-an-array"` → falls back to defaults for signals
- [ ] `toIcpConfirmEdits(state, finalEdits)` → `edits === finalEdits` verbatim; `reviewEdits` non-empty for changed sections
- [ ] `toIcpConfirmEdits(state)` without finalEdits → `edits` matches orchestrator coercion; `reviewEdits === []`
- [ ] `reviewEdits[n].dimensionKey` matches the edited top-level section name (`"firmographics"`, not `"icp.firmographics"`)

### C5 — `detectIcpDisagreements` (pure)

Heuristic is mixed-provenance + keyword. Pin the contract so prompt drift surfaces.

- [ ] State with empty `artifacts` manifest → returns `[]`
- [ ] Dimension with provenance only from `company_context` → not flagged
- [ ] Dimension with provenance only from `positive_example` → not flagged
- [ ] Mixed provenance + summary `"exemplars contradict declared ICP"` → flagged, `severity='high'`
- [ ] Mixed provenance + summary `"exemplars skew A-B, however user declared A-C"` → flagged, `severity='medium'`
- [ ] Mixed provenance + summary `"3 of 4 are devtools"` (no keyword) → NOT flagged (prevents over-calls, audit fix #3)
- [ ] High keyword beats medium when both present in summary
- [ ] `declaredSources` / `inferredSources` populated from `state.artifacts[*].sourceLabel` by artifact-id lookup

### C6 — Persona preflight (regression-lock, already tested)

- [ ] `profile.user_type=null` + ICP confirm → succeeds, writes `user_type='gtm'`
- [ ] `profile.user_type='gtm'` + ICP re-confirm → succeeds, no-op on user_type
- [ ] `profile.user_type='job_seeker'` + ICP confirm → blocks with error including `"mix personas"`
- [ ] On blocked confirm: no ICP memory docs, no pipeline_config, no icp_rubric, interview stays in `review`

### C7 — Idempotency

After C1 runs once, revert `interview.status` to `'review'`, re-run `performConfirm` with same edits:

- [ ] `memory_documents` count scoped to user+origin='onboarding' still exactly 3
- [ ] `pipeline_config` count still exactly 1
- [ ] `user_scoring_profiles` count still exactly 1
- [ ] All content byte-for-byte identical to after first run

## Expected red/green on main

**Red on main (will go green after fix):**

- C1 rubric assertions — 6 failures expected

**Green on main (regression lock):**

- C1 memory doc assertions, C2–C7

## The fix (one change, after C1 goes red)

In `src/app/(app)/onboard/interview-actions.ts:378-388`, agentic branch of `confirmInterviewAction`, add one line to the update payload:

```diff
  await svc
    .from("onboarding_interviews")
    .update({
      orchestrator_state: {
        ...state,
        metrics: { ...state.metrics, reviewEdits },
      },
+     extracted: finalEdits,
      updated_at: new Date().toISOString(),
    })
    .eq("id", interviewId);
```

`interview.extracted` becomes the confirmed snapshot (user's edits, not orchestrator's version). The ICP normalizer (`icp-definition.ts:195`) already reads `interview.extracted` — no change needed there.

**Alternative** (more surgical, less global side-effect): extend `normalizeScoringProfile`'s context to accept an optional `edits` payload and prefer it over the DB read. Single-site change in `icp-definition.ts`. Either works; the payload update is simpler and also benefits any future reader of `interview.extracted` post-confirm.

## Out of scope (separate tickets)

- `analyzeArtifacts` Opus call — needs fixture-replay harness (`runGenerateObject` mock)
- `updateDimensionFromAnswer` Opus call — same
- Streaming wrap-up / chat route turn-by-turn behavior — same
- `IcpDashboard` RSC rendering — snapshot test or Playwright, neither deterministic enough for this script
- `ReviewIcp` form hydration and controlled-state edits — component test
- Full end-to-end (upload → chat → review → confirm) — integration test, needs Opus

## Steps to build

1. Write `scripts/test-icp-interview.ts` with all C1–C7 assertions. Expect C1 rubric assertions to fail on main.
2. Add `"test:icp-interview": "tsx scripts/test-icp-interview.ts"` to `package.json`.
3. Export `applyIcpExemplarScarcityClamp` from `src/lib/onboarding/orchestrator/run.ts` (one-line change, follows `countPositiveExemplars` pattern).
4. Run the script → confirm 6 C1 rubric assertions fail, everything else passes.
5. Apply the one-line fix in `interview-actions.ts`.
6. Run again → all green.
7. Single commit: "test + fix: user edits now reach icp_rubric at confirm time" (one commit per phase per feedback memory).
