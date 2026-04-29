# ICP Rubric Architecture

## Problem with the current approach

Opus reads artifacts and self-assigns a `confidence: 0–1` per dimension based on a vague prompt ("High >0.8 only when evidence directly supports it"). That number is what gates whether the interviewer asks the user about a dimension. It is opaque, unverifiable, and inconsistent across runs.

## Goal

Replace model-assigned confidence with a deterministic, checklist-based system:

- Core ICP dimensions are separated from evidence/calibration data and scoring outputs
- Each ICP dimension is broken into explicit sub-dimensions
- Each sub-dimension has a type and (for constrained fields) a defined list of valid values with explicit definitions
- Confidence = `filled_sub_dims / total_sub_dims` — computed by the system, not the model
- The config is the single source of truth; changes to it flow automatically through onboarding, rubric storage, and account scoring

---

## Architecture

```
icp-dimensions.ts          ← single source of truth: ICP dimensions, evidence fields, enums + definitions
      ↓
icp-schemas.ts             ← Zod schemas built dynamically from the config
      ↓
icp-prompts.ts             ← Opus/interviewer prompts render the current sub-dim checklist from config
      ↓
icp-definition.ts          ← InterviewTemplate, renderers, defaults, and normalizer derive from config
      ↓
orchestrator/run.ts        ← Opus fills sub-fields; system computes confidence = filled/total from config
      ↓
icp_rubric JSONB           ← stored ICP definition mirrors the config structure
      ↓
scoring-account.ts         ← scores inbound accounts per ICP sub-dimension using the same config
```

The only file you edit to add, remove, or redefine a sub-dimension or enum value is `icp-dimensions.ts`. Everything downstream derives from it.

---

## Layer separation

The rubric should separate three concepts that are currently mixed together:

1. **ICP definition** — what a good-fit account looks like.
2. **Evidence/calibration** — why we believe this ICP is true.
3. **Scoring output** — how a new account performed against the ICP.

Core ICP definition dimensions:

- `product`
- `buyer`
- `firmographics`
- `technographics`
- `signals`
- `disqualifiers`

Evidence/calibration fields:

- `proof_points`
- `source_urls`
- `example_customers`
- `won_deals`
- `lost_deals`
- `confidence_notes`
- required per-sub-dimension evidence metadata

Scoring output fields:

- `fit_score`
- `urgency_score`
- `evidence_strength`
- `disqualification_flags`
- per-sub-dimension score breakdowns

`proof_points` should not be treated as a core ICP dimension. It is still important, but it belongs in the evidence/calibration layer because it explains where the ICP came from and which customer examples support it.

This keeps the product more explainable:

- **Completeness confidence** answers: "How much of the rubric is filled in?"
- **Evidence strength** answers: "How trustworthy is the support for this field?"
- **Account score** answers: "How well does this account match?"

Every sub-dimension should carry required evidence metadata. The evidence object is required even when the actual proof is weak or missing. In that case, `proofPoints` can be empty and `strength` should be `weak_or_unknown`.

Evidence strength should be metadata on sub-dimensions, not another ICP field. Example values:

- `direct_user_provided`
- `inferred_from_customer_examples`
- `inferred_from_public_data`
- `weak_or_unknown`

Example shape:

```ts
{
  value: "b2b_saas",
  evidence: {
    strength: "inferred_from_customer_examples",
    proofPoints: ["Acme and Linear both match this pattern"],
    sources: [...],
    notes: "Pattern seen across provided positive examples."
  }
}
```

This allows a field to be complete but weakly supported, or incomplete but backed by strong evidence for the parts that are present.

---

## Config-driven behavior

The master config is the blueprint for the ICP system. Downstream code should read from it instead of hard-coding rubric fields in multiple places.

When a dimension, sub-dimension, enum value, or definition changes in `icp-dimensions.ts`, these systems should update automatically:

- **Zod validation** — schemas are generated from the config, including enum constraints, defaults, and range shapes.
- **Confidence calculation** — `calculateConfidence(value)` counts filled sub-dimensions using the config's type-aware rules.
- **Agent prompts** — the orchestrator and interviewer prompts render the current dimension checklist, field names, output shape, enum options, and value definitions from the config.
- **Rubric storage** — `user_scoring_profiles.icp_rubric` mirrors the core ICP definition structure instead of using a separate hand-written shape.
- **Evidence storage** — every sub-dimension has required evidence metadata; proof points, sources, examples, and evidence-strength metadata are stored separately from raw values, or under a clearly separated evidence key.
- **Review/edit UI** — fields render from config metadata where practical, with custom controls by sub-dimension type (`range`, enum single/multi, string arrays, freetext).
- **TheirStack filter mapping** — discovery filters read the normalized rubric shape from config-derived schemas.
- **Account scoring** — scoring uses the config to build a per-sub-dimension scorecard and explanation.

The goal is that adding `business_model` to `firmographics`, for example, automatically updates validation, prompt instructions, confidence denominator, rubric storage, review/edit controls, and scoring anchors. It should not automatically turn evidence/calibration fields into ICP scoring dimensions.

The config should also support changing the rubric itself over time:

- Add, remove, or rename top-level dimensions
- Add, remove, or rename sub-dimensions
- Change sub-dimension definitions and scoring criteria
- Change enum values and their definitions
- Change per-dimension pass/fail thresholds
- Change what counts as "filled" for confidence calculation
- Add or tune per-sub-dimension scoring weights

These changes should flow automatically through any system that is built directly from the config.

Some changes may still require small custom adapters when they touch an external API or non-generic business rule. For example, adding `revenue_range` can automatically update schemas, prompts, confidence, rubric storage, review UI, and scoring instructions, but mapping it to TheirStack filters may require explicit code if TheirStack exposes revenue as a special field.

---

## `icp-dimensions.ts` responsibilities

The config should define:

- Dimension key, label, description, and confidence threshold
- Ordered sub-dimensions for each dimension
- Sub-dimension key, label, description, type, default value, and scoring guidance
- Enum values as detailed objects, not plain strings
- Evidence/calibration fields, separate from core ICP dimensions
- Required per-sub-dimension evidence metadata shape
- Evidence-strength metadata allowed values and definitions
- Reused enum lists, such as `stages`, so `firmographics.stages` and `disqualifiers.stage_disqualifiers` stay aligned
- Optional per-sub-dimension scoring weight, defaulting to uniform weights for v1

Enum value objects should be detailed enough to drive prompts, UI labels, validation, and scoring. Recommended fields:

- `value` — stable machine key
- `label` — user-facing label
- `definition` — what the value means
- `includeWhen` — criteria for assigning this value
- `excludeWhen` — criteria for not assigning this value
- `scoringGuidance` — how this value should affect account scoring

Example:

```ts
{
  value: "b2b_saas",
  label: "B2B SaaS",
  definition: "Company sells subscription software to businesses.",
  includeWhen: "Revenue comes mainly from recurring software subscriptions.",
  excludeWhen: "Revenue comes mainly from services, ads, or transaction fees.",
  scoringGuidance: "Strong match when the target account monetizes through recurring B2B software subscriptions."
}
```

The config should also expose helpers derived from the definitions:

- `getDimensionKeys()`
- `getDimensionSchema(dimensionKey)`
- `getDefaultRubric()`
- `getDefaultEvidence()`
- `getDefaultSubDimensionEvidence()`
- `calculateConfidence(dimensionKey, value)`
- `renderPromptChecklist()`
- `renderRubricForScoring(rubric)`

These helpers keep downstream files small and prevent each caller from reimplementing config traversal differently.

---

## Sub-dimension types

| Type           | Example sub-dims                                             | AI output shape                                                             |
| -------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `freetext`     | `core_jtbd`, `wedge`, `pain_language`                        | any non-empty string                                                        |
| `enum_single`  | `business_model`, `tech_maturity`, `delivery_model`          | exactly one value from the defined list                                     |
| `enum_multi`   | `industries`, `stages`, `geographies`, `data_infrastructure` | one or more values (unordered tag set / multi-select from the defined list) |
| `string_array` | `hiring_roles`, `existing_customers`, `lost_deals_reasons`   | free-form list (no enum constraint)                                         |
| `range`        | `employee_range`                                             | `{ min: number, max: number }`                                              |

---

## Confidence calculation

```
confidence = count(non-empty sub-dims) / total sub-dims
```

"Non-empty" is type-aware:

- `freetext` — non-blank string
- `enum_single` — a valid selection was made
- `enum_multi` — at least one selection
- `string_array` — at least one non-blank entry
- `range` — both `min` and `max` are present and non-default

The per-dimension threshold stays as-is (0.75 for most, 0.70 for `technographics` and `signals`). If `confidence >= threshold`, the interviewer skips asking about that dimension.

Because every sub-dimension also carries evidence metadata, the system should distinguish structural completeness from evidence quality:

- **Completeness confidence** — whether the value is filled, regardless of evidence strength.
- **Evidence coverage** — whether filled values are supported by useful evidence.

A sub-dimension with `evidence.strength = "weak_or_unknown"` counts as filled for the completeness numerator if its value is non-empty, but it should not count as evidence-covered.

This prevents a complete-but-weak rubric from looking stronger than it is. The interviewer should skip a dimension only when:

1. Completeness confidence meets the dimension threshold, and
2. Evidence coverage is acceptable, or the user directly confirms the weak fields.

For v1, acceptable evidence coverage can be simple:

```txt
evidenceCoverage = count(filled sub-dims where evidence.strength != "weak_or_unknown") / total_sub_dims
```

Recommended skip rule:

```txt
skip_dimension =
  completenessConfidence >= confidenceThreshold
  AND (
    evidenceCoverage >= evidenceThreshold
    OR weak fields were directly confirmed by the user
  )
```

Default `evidenceThreshold` should match the dimension's confidence threshold unless the config overrides it.

The model should no longer output or control confidence. If the structured-output schema still includes a confidence field during a transition period, the system must ignore it and recompute confidence from the returned value.

The current exemplar-scarcity clamp should be revisited. It conflicts with the new definition of confidence because confidence now means "rubric completeness," not "strength of evidence." If we still need evidence-quality tracking, it should become a separate field such as `evidenceStrength` or `provenanceCoverage`, not part of confidence.

---

## Core ICP dimensions and sub-dimensions

The 6 core ICP definition dimensions and their proposed sub-dimensions. Constrained enum lists for technographics and firmographics are specified under `docs/dimensions/*`; **`icp-dimensions.ts` is still the runtime source of truth** until the config is implemented and wired through schemas and prompts.

### product (threshold 0.75 — need 3/4)

| Sub-dimension    | Type          | Notes                                                                                                              |
| ---------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| `category`       | `freetext`    | Product category / market space                                                                                    |
| `core_jtbd`      | `freetext`    | The primary job-to-be-done the product replaces or augments                                                        |
| `wedge`          | `freetext`    | The specific beachhead use case or entry point                                                                     |
| `delivery_model` | `enum_single` | How the product is delivered and consumed — see [`dimensions/delivery-model.json`](dimensions/delivery-model.json) |

### buyer (threshold 0.75 — need 3/4)

| Sub-dimension    | Type       | Notes                                                |
| ---------------- | ---------- | ---------------------------------------------------- |
| `economic_buyer` | `freetext` | Role/title of who approves budget                    |
| `champion`       | `freetext` | Role/title of internal sponsor who drives adoption   |
| `end_user`       | `freetext` | Role/title of the day-to-day user                    |
| `deal_blocker`   | `freetext` | Role/function that most often blocks or delays deals |

### firmographics (threshold 0.75 — need 4/5)

| Sub-dimension    | Type          | Notes                                                                                                                                                                                                                 |
| ---------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `industries`     | `enum_multi`  | Target industry verticals — canonical labels in [`dimensions/pitchbook-industry-verticals.json`](dimensions/pitchbook-industry-verticals.json) (`jumpToIndex`; see `icpRubric` + `industryVerticals` for definitions) |
| `employee_range` | `range`       | Headcount `{ min, max }` — preset bands in [`dimensions/employee-range.json`](dimensions/employee-range.json)                                                                                                         |
| `stages`         | `enum_multi`  | Target financing / lifecycle stage — [`dimensions/stages.json`](dimensions/stages.json) (reused by `disqualifiers.stage_disqualifiers`)                                                                               |
| `geographies`    | `enum_multi`  | Target regions — groupings in [`dimensions/geographies.json`](dimensions/geographies.json)                                                                                                                            |
| `business_model` | `enum_single` | How the target company makes money — [`dimensions/business-models.json`](dimensions/business-models.json) (nav: [`business-models.md`](dimensions/business-models.md))                                                |

### technographics (threshold 0.70 — need 3/4)

| Sub-dimension         | Type                         | Notes                                                                                                                                              |
| --------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `required_tools`      | `string_array`               | Tools the target must already have                                                                                                                 |
| `excluded_tools`      | `string_array`               | Tools that disqualify                                                                                                                              |
| `tech_maturity`       | `enum_single`                | Adoption posture toward emerging tech — [`dimensions/tech-maturity.json`](dimensions/tech-maturity.json) (`definition` + `assign_when` per value)  |
| `data_infrastructure` | `enum_multi` (multi-tag set) | Data/infra tags — pick all that apply; [`dimensions/data-infrastructure.json`](dimensions/data-infrastructure.json) (`selectionMode`: `multi_tag`) |

### signals (threshold 0.70 — need 3/4)

| Sub-dimension    | Type           | Notes                                                             |
| ---------------- | -------------- | ----------------------------------------------------------------- |
| `hiring_roles`   | `string_array` | Job posting titles that reveal active pain                        |
| `jtbd_evidence`  | `string_array` | Observable indicators of the job-to-be-done                       |
| `trigger_events` | `string_array` | Events that create urgency (funding, reorg, product launch, etc.) |
| `pain_language`  | `freetext`     | Specific phrases the buyer uses to describe the problem           |

### disqualifiers (threshold 0.75 — need 3/4)

| Sub-dimension              | Type           | Notes                                                                   |
| -------------------------- | -------------- | ----------------------------------------------------------------------- |
| `tech_disqualifiers`       | `string_array` | Competing or incompatible tools                                         |
| `size_disqualifiers`       | `freetext`     | Headcount or revenue bands that are hard nos                            |
| `stage_disqualifiers`      | `enum_multi`   | Company stages that are hard nos — reuses stages enum                   |
| `behavioral_disqualifiers` | `string_array` | Mindset or cultural red flags (e.g. DIY mentality, no budget ownership) |

---

## Conflict resolution

Firmographics, technographics, and signals describe positive-fit criteria. Disqualifiers describe hard negative criteria. When they conflict, disqualifiers win for account filtering and scoring.

Examples:

- If `firmographics.stages = ["seed", "series_a", "series_b"]` and `disqualifiers.stage_disqualifiers = ["series_b"]`, then `series_b` is treated as disqualified.
- If `firmographics.employee_range = { min: 5, max: 500 }` and `disqualifiers.size_disqualifiers = "no companies under 50 employees"`, then companies with fewer than 50 employees are disqualified even though they fit the broad employee range.

The system should not silently store these contradictions without surfacing them. During onboarding and review, config-derived conflict checks should flag:

- Positive enum values that also appear in corresponding disqualifier enum lists
- Positive ranges that overlap with size disqualifier rules
- Required tools that also appear in excluded or disqualifying tools
- Signals that are contradicted by behavioral disqualifiers

Resolution policy:

1. **Review-time behavior** — surface the conflict to the user and ask them to resolve it when possible.
2. **Storage behavior** — allow saving unresolved conflicts only if they are explicitly marked as unresolved or intentional.
3. **Scoring/filtering behavior** — disqualifiers override positive-fit criteria.
4. **Prompting behavior** — the interviewer should prioritize conflict questions before asking for additional detail.

The config should expose enough metadata to support generic conflict checks, such as `conflictsWith`, `disqualifierFor`, or shared enum references. Custom checks may still be needed for freetext fields like `size_disqualifiers`.

---

## Chat asking granularity

The current orchestrator asks one top-level dimension per turn and expects the model to extract all sub-fields in that dimension from the user's answer. Explicit sub-dimensions create two possible interview modes:

1. **Dimension-level asking** — ask about one dimension per turn, then extract all missing/weak sub-dimensions from the answer.
2. **Sub-dimension-level asking** — ask about one specific sub-dimension per turn.

Recommended v1 behavior: keep **dimension-level asking** as the default, but make the interviewer aware of missing sub-dimensions inside the dimension.

Reasoning:

- It keeps the interview shorter.
- Users usually answer naturally with multiple related details at once.
- The deterministic confidence calculator can still measure exactly which sub-dimensions were filled.
- The review screen can show which sub-dimensions remain empty or weakly supported.

Sub-dimension-level asking should be reserved for follow-ups when:

- A dimension is close to the confidence threshold but one specific sub-dimension is missing.
- A conflict needs to be resolved.
- A high-impact field is missing, such as `buyer.economic_buyer`, `firmographics.employee_range`, or `signals.hiring_roles`.
- The user gave an ambiguous answer and the system needs one precise clarification.

Implementation impact:

- `nextDimensionToAsk` can remain dimension-based for v1, but it should use config-derived missing-sub-dimension metadata to pick better questions.
- A future `nextSubDimensionToAsk` helper can be added if the product chooses a more granular interview mode.
- The interviewer prompt should receive the list of missing, filled, weak-evidence, and conflicting sub-dimensions for the active dimension.
- The chat UX should avoid one-question-per-field unless the user is in a correction/follow-up path.

This preserves a concise onboarding experience while still getting the benefits of explicit sub-dimensions.

---

## Prompt budget strategy

Detailed enum definitions are required in `icp-dimensions.ts`, but not every prompt should receive the full detail. With 25+ sub-dimensions and enum values that include `definition`, `includeWhen`, `excludeWhen`, and `scoringGuidance`, a naive `renderPromptChecklist()` could make the orchestrator prompt too large.

The config should support multiple prompt render modes:

1. **Compact extraction mode** — used by the orchestrator/analyzer during onboarding.
2. **Focused interview mode** — used by the interviewer for the active dimension only.
3. **Full scoring mode** — used by account scoring when judging fit against a confirmed rubric.

Recommended behavior:

- The orchestrator/analyzer gets field keys, labels, output shapes, short definitions, and allowed enum values.
- The interviewer gets fuller detail only for the active dimension and only for missing, weak, or conflicting sub-dimensions.
- The scorer gets the richest enum guidance, including `includeWhen`, `excludeWhen`, and `scoringGuidance`, because it is judging account fit.
- Long enum lists should be summarized or scoped to relevant dimensions during onboarding.
- Shared enum definitions should be referenced by stable keys so prompts can include compact labels while schemas still enforce exact values.

Suggested helper API:

```ts
renderPromptChecklist({
  mode: "compact_extraction" | "focused_interview" | "full_scoring",
  dimensionKey?: string,
  includeEvidenceGuidance?: boolean
})
```

This keeps the master config detailed without forcing every agent call to carry the full rubric encyclopedia.

---

## Evidence/calibration fields

These fields support and calibrate the ICP, but they are not core ICP dimensions and should not be counted in ICP completeness confidence.

### proof_points

| Sub-dimension        | Type           | Notes                                                                 |
| -------------------- | -------------- | --------------------------------------------------------------------- |
| `existing_customers` | `string_array` | Named logos — only names the user explicitly provided, never invented |
| `won_deals`          | `string_array` | Specific wins and what they had in common                             |
| `lost_deals_reasons` | `string_array` | Why deals are lost                                                    |
| `success_patterns`   | `freetext`     | Common characteristics across wins                                    |

### source metadata

| Field              | Type           | Notes                                                                 |
| ------------------ | -------------- | --------------------------------------------------------------------- |
| `source_urls`      | `string_array` | URLs or artifact sources that support the rubric                      |
| `example_customers`| `string_array` | Customer examples used to calibrate the ICP                           |
| `confidence_notes` | `string_array` | Human-readable notes about weak, missing, or conflicting evidence     |

### evidence strength

Evidence metadata is required for every core ICP sub-dimension. The proof point list inside that metadata may be empty, but the system should still record strength, sources, and notes so weak or missing evidence is explicit.

Recommended shape:

```ts
type SubDimensionEvidence = {
  strength:
    | "direct_user_provided"
    | "inferred_from_customer_examples"
    | "inferred_from_public_data"
    | "weak_or_unknown";
  proofPoints: string[];
  sources: Array<{
    type: "artifact" | "url" | "user_answer" | "public_research";
    label: string;
    quote?: string;
  }>;
  notes?: string;
};
```

Allowed `strength` values:

| Value                              | Meaning                                                        |
| ---------------------------------- | -------------------------------------------------------------- |
| `direct_user_provided`             | The user explicitly supplied or confirmed this field           |
| `inferred_from_customer_examples`  | Inferred from positive/negative customer examples              |
| `inferred_from_public_data`        | Inferred from public company data, websites, jobs, or research |
| `weak_or_unknown`                  | Weakly supported, ambiguous, or missing evidence               |

---

## Scoring pipeline integration

Once the core ICP definition is stored in `user_scoring_profiles.icp_rubric`, `scoring-account.ts` scores inbound accounts per ICP sub-dimension. The match signal for each account goes from a single dimension-level score to a per-sub-dimension breakdown, making it possible to surface _why_ an account is a strong or weak fit.

Evidence/calibration data can inform the scorer, but it should not be treated as another fit dimension. For example, `proof_points.existing_customers` can help explain relevance, but the account should still be scored primarily against the core ICP definition.

For v1, sub-dimensions can be weighted uniformly. Later, weights can be added to `icp-dimensions.ts` without changing the scorer contract.

The scorer output should move from broad dimensions like:

```json
{
  "firmo_fit": { "score": 4, "reasoning": "..." }
}
```

to a config-shaped breakdown like:

```json
{
  "firmographics": {
    "industries": { "score": 4, "reasoning": "..." },
    "employee_range": { "score": 5, "reasoning": "..." },
    "stages": { "score": 3, "reasoning": "..." },
    "geographies": { "score": 4, "reasoning": "..." },
    "business_model": { "score": 4, "reasoning": "..." }
  }
}
```

The account's final normalized score is computed from the sub-dimension scores and weights.

The UI can still show high-level dimension summaries, but they should be aggregates of the sub-dimension scores rather than separate model-generated scores.

Evidence strength can be surfaced beside the score so users can distinguish "strong match with strong evidence" from "strong match based on weak evidence."

---

## Compatibility and migration

Existing users may already have old-shape `icp_rubric` JSON, old `onboarding_interviews.extracted`, and old `orchestrator_state.dimensions[*].value`.

Because these are JSONB fields, a database schema migration is not strictly required, but runtime compatibility is required:

- Add a coercion/migration function that converts the old rubric shape into the new config-shaped rubric before or at the same time as the schema swap.
- Accept old field names during parsing where possible, especially `employee_range_min` / `employee_range_max`.
- Convert old `disqualifiers: string[]` into the new structured disqualifier object.
- Move old `proof_points` data out of the core ICP dimensions and into the evidence/calibration layer.
- Fill newly added sub-dimensions with config defaults.
- Write the new shape back on the next save/confirm.

Compatibility cannot be a later follow-up after the schema changes. Existing saved ICPs must continue to parse throughout the migration, otherwise there is a broken intermediate window where current users' rubrics fail validation.

---

## Minimal implementation order

1. Create `icp-dimensions.ts` with core ICP dimensions, evidence/calibration fields, enum definitions, defaults, and confidence helpers.
2. Add old-shape compatibility/coercion helpers and tests before enforcing config-shaped schemas anywhere.
3. Rebuild `icp-schemas.ts` from config while preserving existing exported schema/type names where possible; schema parsing must accept old shapes and normalize them to the new shape.
4. Update `icp-prompts.ts` so orchestrator and extraction prompts render the config-derived field checklist and no longer ask the model to decide confidence.
5. Update `orchestrator/run.ts` so Opus fills values only and the system computes confidence from `calculateConfidence`.
6. Update `icp-definition.ts` so template dimensions, renderers, meaningfulness checks, memory-doc output, `icp_rubric` normalization, and evidence output derive from the config.
7. Update `orchestrator/to-confirm-edits.ts` to coerce orchestrator values into config-shaped review edits.
8. Update onboarding review UI and ICP dashboard UI to render config-shaped fields.
9. Update `icp-to-theirstack-filters.ts` for the new rubric shape.
10. Update `scoring-account.ts` and account-fit prompt/schema to produce per-sub-dimension scoring while treating proof points as evidence/calibration, not a fit dimension.
11. Update score persistence/readers so stored score components can support the new breakdown.
12. Verify with typecheck/build plus one fresh onboarding flow and one existing-user rubric flow.

---

## What you edit to update the rubric

1. Open `icp-dimensions.ts`
2. Add/remove a sub-dimension, or expand an enum list with new values + definitions
3. Deploy

The Zod schemas, Opus prompt (sub-dim checklist), confidence gate, `icp_rubric` shape, review/edit fields, and scoring rubric should all update automatically from the config.

---

## Open items

- Dimension sources in `docs/dimensions/` (mirror into `icp-dimensions.ts` when implementing): `delivery_model` → [`delivery-model.json`](dimensions/delivery-model.json); `industries` → [`pitchbook-industry-verticals.json`](dimensions/pitchbook-industry-verticals.json); `business_model` → [`business-models.json`](dimensions/business-models.json); `geographies` → [`geographies.json`](dimensions/geographies.json); `stages` → [`stages.json`](dimensions/stages.json); `employee_range` presets → [`employee-range.json`](dimensions/employee-range.json); `tech_maturity` → [`tech-maturity.json`](dimensions/tech-maturity.json); `data_infrastructure` → [`data-infrastructure.json`](dimensions/data-infrastructure.json)
- Scoring weight per sub-dimension (uniform for now; can be made configurable in the same config)
- Review UI update: sub-dimension breakdown visible on the review screen so the user can see exactly which sub-fields Opus filled vs. left empty
