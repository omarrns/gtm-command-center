import type { gmail_v1 } from "googleapis";
import { __setRunGenerateObjectForTests } from "../src/lib/ai/calls";
import { MODELS } from "../src/lib/ai/anthropic";
import {
  extractMessageText,
  findLatestInboundReply,
} from "../src/lib/integrations/gmail-replies";
import { classifyReplyBody } from "../src/lib/outreach/reply-classification";
import { buildReplyDetectionMetadata } from "../src/lib/outreach/reply-metadata";

let failures = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

function encoded(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function message(input: {
  id: string;
  date: string;
  from: string;
  mimeType: string;
  data?: string;
  parts?: gmail_v1.Schema$MessagePart[];
}): gmail_v1.Schema$Message {
  return {
    id: input.id,
    internalDate: input.date,
    payload: {
      mimeType: input.mimeType,
      headers: [{ name: "From", value: input.from }],
      body: input.data ? { data: encoded(input.data) } : undefined,
      parts: input.parts,
    },
  };
}

function part(
  mimeType: string,
  data: string | null,
  parts?: gmail_v1.Schema$MessagePart[],
): gmail_v1.Schema$MessagePart {
  return {
    mimeType,
    body: data ? { data: encoded(data) } : undefined,
    parts,
  };
}

async function testMimeExtraction(): Promise<void> {
  const plain = message({
    id: "plain",
    date: "1",
    from: "a@example.com",
    mimeType: "text/plain",
    data: "Plain reply",
  });
  assert(extractMessageText(plain) === "Plain reply", "extracts text/plain");

  const multipart = message({
    id: "multi",
    date: "1",
    from: "a@example.com",
    mimeType: "multipart/alternative",
    parts: [
      part("text/html", "<p>HTML reply</p>"),
      part("text/plain", "Preferred plain"),
    ],
  });
  assert(
    extractMessageText(multipart) === "Preferred plain",
    "prefers text/plain over HTML",
  );

  const htmlOnly = message({
    id: "html",
    date: "1",
    from: "a@example.com",
    mimeType: "text/html",
    data: "<p>Need more info&nbsp;&amp; timing</p>",
  });
  assert(
    extractMessageText(htmlOnly) === "Need more info & timing",
    "falls back to sanitized HTML text",
  );

  const empty = message({
    id: "empty",
    date: "1",
    from: "a@example.com",
    mimeType: "text/plain",
  });
  assert(extractMessageText(empty) === null, "empty body returns null");

  const malformed = {
    payload: { mimeType: "text/plain", body: { data: "%%%" } },
  } as gmail_v1.Schema$Message;
  assert(extractMessageText(malformed) === null, "malformed body returns null");
}

async function testInboundSelection(): Promise<void> {
  const thread: gmail_v1.Schema$Thread = {
    messages: [
      message({
        id: "original",
        date: "1",
        from: "me@example.com",
        mimeType: "text/plain",
        data: "Original outreach",
      }),
      message({
        id: "self-follow-up",
        date: "3",
        from: "Me <me@example.com>",
        mimeType: "text/plain",
        data: "Following up",
      }),
      message({
        id: "reply",
        date: "2",
        from: "Buyer <buyer@example.com>",
        mimeType: "text/plain",
        data: "Sure, send more details.",
      }),
    ],
  };

  const reply = findLatestInboundReply(thread, {
    originalMessageId: "original",
    senderAddress: "me@example.com",
  });

  assert(reply?.gmailMessageId === "reply", "selects latest inbound reply");
  assert(reply?.body === "Sure, send more details.", "returns inbound body");
}

async function testClassification(): Promise<void> {
  const models: string[] = [];

  __setRunGenerateObjectForTests((args) => {
    models.push(args.model);
    return args.schema.parse({
      classification: "positive_interest",
      objection_theme: null,
    });
  });

  const first = await classifyReplyBody({
    replyBody: "Interested.",
    scope: { userId: "user-1", callPurpose: "reply_classification" },
  });
  assert(first.classification === "positive_interest", "classifies success");
  assert(models[0] === MODELS.tinyExtraction, "uses primary tiny model");

  let calls = 0;
  __setRunGenerateObjectForTests((args) => {
    calls++;
    if (calls === 1) throw new Error("primary failed");
    models.push(args.model);
    return args.schema.parse({
      classification: "objection",
      objection_theme: "timing",
    });
  });

  const fallback = await classifyReplyBody({
    replyBody: "Timing is bad.",
    scope: { userId: "user-1", callPurpose: "reply_classification" },
  });
  assert(fallback.objection_theme === "timing", "fallback classifies result");
  assert(models.includes(MODELS.haiku), "uses haiku fallback");

  __setRunGenerateObjectForTests(() => {
    throw new Error("failed");
  });

  let threw = false;
  try {
    await classifyReplyBody({
      replyBody: "Nope.",
      scope: { userId: "user-1", callPurpose: "reply_classification" },
    });
  } catch {
    threw = true;
  }
  assert(threw, "throws after primary and fallback fail");
  __setRunGenerateObjectForTests(null);
}

async function testReplyMetadataBehavior(): Promise<void> {
  const log = {
    context: {},
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    child: () => log,
  };

  let fetchCalled = false;
  const legacy = await buildReplyDetectionMetadata({
    threadId: "thread-1",
    originalMessageId: "original",
    userId: "user-1",
    opportunityId: "opp-1",
    runId: "run-1",
    hasBodyScope: false,
    senderAddress: "me@example.com",
    log,
    fetchReply: async () => {
      fetchCalled = true;
      return null;
    },
    classify: async () => {
      throw new Error("should not classify");
    },
  });
  assert(
    legacy.classificationStatus === "skipped_missing_scope",
    "legacy credentials skip classification",
  );
  assert(!fetchCalled, "missing scope does not fetch reply body");

  const classified = await buildReplyDetectionMetadata({
    threadId: "thread-1",
    originalMessageId: "original",
    userId: "user-1",
    opportunityId: "opp-1",
    runId: "run-1",
    hasBodyScope: true,
    senderAddress: "me@example.com",
    log,
    fetchReply: async () => ({
      gmailMessageId: "reply-1",
      body: "Interested, send details.",
    }),
    classify: async () => ({
      classification: "positive_interest",
      objection_theme: null,
    }),
  });
  assert(
    classified.classificationStatus === "classified",
    "reply body success stores classified status",
  );
  assert(
    classified.classification === "positive_interest",
    "reply body success stores classification",
  );
  assert(!("replyBody" in classified), "metadata does not store raw body");

  const fetchFailure = await buildReplyDetectionMetadata({
    threadId: "thread-1",
    originalMessageId: "original",
    userId: "user-1",
    opportunityId: "opp-1",
    runId: "run-1",
    hasBodyScope: true,
    senderAddress: "me@example.com",
    log,
    fetchReply: async () => {
      throw new Error("gmail failed with private details".repeat(20));
    },
    classify: async () => {
      throw new Error("should not classify");
    },
  });
  assert(
    fetchFailure.classificationStatus === "failed",
    "body fetch failure records failed status",
  );
  assert(
    fetchFailure.classificationError === "body_fetch_failed",
    "body fetch failure stores non-sensitive label",
  );

  const modelFailure = await buildReplyDetectionMetadata({
    threadId: "thread-1",
    originalMessageId: "original",
    userId: "user-1",
    opportunityId: "opp-1",
    runId: "run-1",
    hasBodyScope: true,
    senderAddress: "me@example.com",
    log,
    fetchReply: async () => ({ gmailMessageId: "reply-1", body: "No." }),
    classify: async () => {
      throw new Error("model failed");
    },
  });
  assert(
    modelFailure.classificationStatus === "failed",
    "model failure records failed status",
  );
  assert(
    modelFailure.classificationError === "classification_failed",
    "model failure stores non-sensitive label",
  );
  assert(
    modelFailure.gmailMessageId === "reply-1",
    "model failure keeps reply message id",
  );
}

async function main(): Promise<void> {
  await testMimeExtraction();
  await testInboundSelection();
  await testClassification();
  await testReplyMetadataBehavior();

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll assertions passed.");
}

main().catch((err) => {
  __setRunGenerateObjectForTests(null);
  console.error(err);
  process.exit(1);
});
