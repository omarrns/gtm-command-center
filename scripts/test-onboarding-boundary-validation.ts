#!/usr/bin/env tsx
/**
 * Behavioral verification for onboarding route request parsers.
 *
 * Pure parser coverage: no auth, Supabase, ingestion, or AI streaming.
 */

import {
  parseArtifactRequest,
  parseChatRequest,
  parseStoryStreamRequest,
} from "../src/app/api/onboard/_lib/request-validation";

let failures = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
  } else {
    failures++;
    console.error(`  FAIL: ${label}`);
  }
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function assertBadRequest(
  result: Promise<{ ok: true } | { ok: false; response: Response }>,
  label: string,
): Promise<void> {
  const parsed = await result;
  if (parsed.ok) {
    assert(false, label);
    return;
  }
  const body = (await parsed.response.json()) as { error?: unknown };
  assert(parsed.response.status === 400 && typeof body.error === "string", label);
}

async function main(): Promise<void> {
  console.log("Onboarding boundary validation — behavioral verification\n");

  console.log("1. /api/onboard/chat");
  const validMessage = {
    id: "msg-1",
    role: "user",
    parts: [{ type: "text", text: "hello" }],
  };
  const validChat = await parseChatRequest(
    jsonRequest({ interviewId: "interview-1", messages: [validMessage] }),
  );
  assert(
    validChat.ok &&
      validChat.data.interviewId === "interview-1" &&
      validChat.data.messages.length === 1,
    "accepts current DefaultChatTransport body shape",
  );
  await assertBadRequest(
    parseChatRequest(jsonRequest({ messages: [validMessage] })),
    "rejects missing interviewId",
  );
  await assertBadRequest(
    parseChatRequest(jsonRequest({ interviewId: "interview-1" })),
    "rejects missing messages before AI work",
  );
  await assertBadRequest(
    parseChatRequest(jsonRequest({ interviewId: "interview-1", messages: {} })),
    "rejects non-array messages",
  );
  await assertBadRequest(
    parseChatRequest(jsonRequest({ interviewId: "interview-1", messages: [{}] })),
    "rejects malformed UI messages",
  );
  await assertBadRequest(
    parseChatRequest(jsonRequest("{not json")),
    "rejects malformed JSON",
  );

  console.log("\n2. /api/onboard/story/stream");
  const validStory = await parseStoryStreamRequest(
    jsonRequest({ interviewId: "interview-1" }),
  );
  assert(
    validStory.ok && validStory.data.interviewId === "interview-1",
    "accepts story reader submit body",
  );
  await assertBadRequest(
    parseStoryStreamRequest(jsonRequest({})),
    "rejects missing interviewId",
  );
  await assertBadRequest(
    parseStoryStreamRequest(jsonRequest("{not json")),
    "rejects malformed JSON",
  );

  console.log("\n3. /api/onboard/artifacts");
  const validUrl = await parseArtifactRequest(
    jsonRequest({
      interviewId: "interview-1",
      kind: "website",
      url: "https://example.com",
    }),
  );
  assert(
    validUrl.ok && validUrl.data.url === "https://example.com",
    "accepts URL artifact",
  );

  const validText = await parseArtifactRequest(
    jsonRequest({
      interviewId: "interview-1",
      kind: "pasted_text",
      text: "Profile notes",
    }),
  );
  assert(
    validText.ok && validText.data.text === "Profile notes",
    "accepts text artifact",
  );

  const validBatch = await parseArtifactRequest(
    jsonRequest({
      interviewId: "interview-1",
      urls: [{ kind: "website", url: "https://example.com" }],
    }),
  );
  assert(validBatch.ok && validBatch.data.urls?.length === 1, "accepts URL batch");

  await assertBadRequest(
    parseArtifactRequest(
      jsonRequest({ interviewId: "interview-1", urls: [{ kind: "website" }] }),
    ),
    "rejects batch item missing url",
  );
  await assertBadRequest(
    parseArtifactRequest(jsonRequest({ interviewId: "interview-1", kind: "website" })),
    "rejects JSON body with neither url, text, nor urls",
  );
  await assertBadRequest(
    parseArtifactRequest(jsonRequest("{not json")),
    "rejects malformed JSON",
  );

  if (failures > 0) {
    console.error(
      `\n${failures} onboarding boundary validation check(s) failed.`,
    );
    process.exit(1);
  }

  console.log("\nAll onboarding boundary validation checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
