# account-scoring fixtures

Saved-output fixtures for `icpAccountAnalysisSchema` (`src/lib/pipeline/scoring-account.ts`). Loaded by `scripts/test-account-scoring-schema.ts` (run via `pnpm test:account-scoring-schema`, included in `pnpm test`).

## File conventions

- `success-*.json` — outputs that MUST `safeParse` cleanly. Each file is a complete `response_object` shape (the same JSON `ai_calls.response_object` stores in production).
- `failure-*.json` — outputs that MUST fail `safeParse`. Co-located with `failure-*.expected.json` describing which Zod path is expected to fail.

## Failure expectations

`failure-*.expected.json` carries:

```json
{
  "pathPrefix": ["verdict"],
  "codes": ["invalid_value", "invalid_enum_value"]
}
```

The test asserts that at least one Zod issue's `path` starts with `pathPrefix` and that the issue's `code` matches one of `codes`. Multiple `codes` are allowed because Zod 3 (`invalid_enum_value`) and Zod 4 (`invalid_value`) emit different codes for the same drift mode. This catches "did we accidentally loosen the schema?" — the failure must fail _for the documented reason_, not for a different one.

## Backfilling from production

The current set is **synthetic** — hand-crafted to exercise the drift modes the audit identified (capitalized enum, missing subdim, null score). They cover the schema today, but the PR 1 plan calls for replacing them with real captures from `ai_calls`:

```
pnpm inspect:ai-errors --purpose=score-account --since=168h
# review ./tmp/ai-call-errors/<stamp>/*.json
# copy the most representative real failures into this directory as failure-*.json
# capture a few real successes as success-*.json
```

When real captures land, delete the synthetic files they replace. Real captures are higher-fidelity regression tests because they reflect actual model output drift, not engineer assumptions.
