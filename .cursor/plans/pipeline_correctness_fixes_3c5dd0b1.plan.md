---
name: pipeline correctness fixes
overview: "Tighten four high-value correctness and observability issues without broad refactors: malformed JSON handling, workflow config error classification, pursuit stage transition validation, and manual-apply success reporting."
todos:
  - id: worker-claim-400
    content: Make malformed and empty JSON bodies fail closed in `src/app/api/worker/claim/route.ts` while preserving valid-body defaults only for valid non-empty JSON that omits `types`.
    status: completed
  - id: workflow-config-errors
    content: Differentiate missing config vs query failure inside `loadConfig()` and keep `pipelineWorkflow()` catch contract unchanged.
    status: completed
  - id: execute-plan-stage-checks
    content: Honor `advanceStage()` return values in `src/lib/pipeline/pursuit/execute-plan.ts` and throw on transition misses.
    status: completed
  - id: manual-apply-match-check
    content: Update `applyManuallyAction()` to verify a row actually matched before returning success, without widening changes in the dirty file.
    status: completed
  - id: targeted-tests
    content: Add or update focused tests for the four changed behaviors only.
    status: completed
isProject: false
---

# Pipeline Correctness Fixes

## Scope

Implement the narrow, high-value fixes only. Avoid broader cleanup, helper extraction, or unrelated refactors.

## Planned Changes

- Harden [`src/app/api/worker/claim/route.ts`](/Users/omarnasser/andrew_gai/gtm-command-center/src/app/api/worker/claim/route.ts)
  Replace the current `request.json().catch(() => ({}))` fallback with guarded parsing.
  Return `400` for malformed JSON and for an empty request body.
  Keep the current default-to-`ALL_JOB_TYPES` behavior only when the JSON body is valid, non-empty, and omits `types`.

- Split config error classification in [`src/lib/pipeline/workflow.ts`](/Users/omarnasser/andrew_gai/gtm-command-center/src/lib/pipeline/workflow.ts)
  Update `loadConfig(userId)` so it no longer erases the distinction between:
  - no `pipeline_config` row for the user
  - Supabase/query failure
    Keep the outer `pipelineWorkflow()` catch narrow and preserve the existing "empty result with `error` field" contract.
    Log the original failure with `userId` before returning the synthetic result.

- Enforce stage-transition truth in [`src/lib/pipeline/pursuit/execute-plan.ts`](/Users/omarnasser/andrew_gai/gtm-command-center/src/lib/pipeline/pursuit/execute-plan.ts)
  Capture the boolean returned by both `advanceStage()` calls in `executePursuit()`.
  If a transition misses, do not return a nominal outcome like `"researched"`, `"needs_contact"`, or `"skipped"`.
  Throw into the existing per-entry error path so caller-visible results cannot claim a state change that never happened.

- Fix false-success reporting in [`src/app/(app)/actions.ts`](</Users/omarnasser/andrew_gai/gtm-command-center/src/app/(app)/actions.ts>)
  Keep this as a minimal patch because the file is already dirty.
  Change the update flow so the action can tell whether a row actually matched, for example by selecting the updated row back (`select("id").maybeSingle()` or equivalent supported pattern).
  Return `{ ok: false, error: ... }` when no row updated, while preserving the existing guard that blocks already-terminal/in-flight stages.
  Avoid helper extraction or broader refactoring in this file during this pass.

## Verification

- Add focused tests only for the changed behaviors.
- Test the stage-transition behavior through the public `executePlans()` surface rather than exporting `executePursuit()` for tests.
- Verify malformed JSON and empty bodies to `worker/claim` return `400`, while valid `{}` still defaults to `ALL_JOB_TYPES`.
- Verify `loadConfig()` distinguishes missing config from query failure and logs useful context.
- Verify `executePursuit()` does not report success when `advanceStage()` returns `false`.
- Verify `applyManuallyAction()` returns failure when no row matched the guarded update.

## Constraints

- No broad DRY cleanup in History/Today loaders.
- No model-ID centralization in this pass.
- No large-file decomposition in onboarding/settings clients.
- Keep the workflow result shape and happy-path behavior unchanged.
