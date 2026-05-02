# Gmail Reply Body Classification

## Summary

Build reply classification as an opt-in follow-up to the existing Gmail reply cron. If Gmail body access is approved, the app requests Gmail read-only scope, reads only tracked reply bodies after a reply is detected, classifies the reply with `runGenerateObject`, and stores only structured metadata on the `reply_detected` outreach event. Raw reply bodies are not persisted.

## Key Changes

- OAuth and re-consent:
  - Use `gmail.send` plus `gmail.readonly`.
  - Store OAuth token response scopes in `gmail_credentials.granted_scopes`.
  - Treat existing credentials without recorded read-only scope as legacy credentials: sending and reply detection continue, but reply body classification is skipped until reconnect.
  - Update Settings, onboarding, privacy, and agent docs to explain tracked-thread body reads, structured classification, no raw body storage, and Gmail disconnect behavior.

- Gmail reply body fetch:
  - Keep `checkReplies` as the minimal reply-detection path.
  - Fetch `format: "full"` only after a reply has been detected and only when credentials include `gmail.readonly`.
  - Select the latest inbound reply by excluding the original sent Gmail message and sender-authored follow-ups.
  - Extract `text/plain` first, falling back to sanitized `text/html`; empty or malformed bodies produce no body.

- Classification:
  - Add a prompt builder under `src/lib/skills/prompts/`.
  - Use a strict Zod schema with `{ classification, objection_theme }`.
  - Use `MODELS.tinyExtraction` first and `MODELS.haiku` as the fallback.
  - Pass scoped AI-call metadata with `runId`, `userId`, and `callPurpose: "reply_classification"`.

- Outreach event metadata:
  - Keep `event_type: "reply_detected"`.
  - Store `gmailThreadId`, `gmailMessageId`, `classificationStatus`, `classification`, `objectionTheme`, `classifiedAt`, and non-sensitive `classificationError` labels.
  - Never store raw reply bodies or excerpts in `outreach_events.metadata`.

## Failure Behavior

- Missing body scope: skip body fetch and record `classificationStatus: "skipped_missing_scope"`.
- Empty body: record `classificationStatus: "skipped_empty_body"`.
- Gmail body fetch failure: record `classificationStatus: "failed"` and `classificationError: "body_fetch_failed"`.
- Model failure after fallback: record `classificationStatus: "failed"` and `classificationError: "classification_failed"`.
- Reply detection remains authoritative: classification failures do not block `sent -> replied`.

## Test Plan

- Unit-test Gmail MIME extraction for plain text, multipart alternative, HTML-only, empty body, and malformed payload fixtures.
- Unit-test inbound reply selection so original sent messages and sender-authored follow-ups are not classified as prospect replies.
- Unit-test classification primary and fallback behavior via `__setRunGenerateObjectForTests`.
- Unit-test reply metadata behavior for legacy credentials, success, body fetch failure, model failure, and no raw body storage.
- Run `pnpm test:gmail-reply-classification`, `pnpm test:outreach-events`, `pnpm typecheck`, and `pnpm agent:check`.
