import type { AiCallScope } from "@/lib/ai/calls";
import type { Logger } from "@/lib/logger";
import type {
  LatestInboundReply,
  FindInboundReplyInput,
} from "@/lib/integrations/gmail-replies";
import type { ReplyClassification } from "@/lib/outreach/reply-classification";

export type ReplyClassificationStatus =
  | "classified"
  | "skipped_missing_scope"
  | "skipped_empty_body"
  | "failed";

interface BuildReplyMetadataInput {
  threadId: string;
  originalMessageId: string | null;
  userId: string;
  opportunityId: string;
  runId: string;
  hasBodyScope: boolean;
  senderAddress: string | null;
  log: Logger;
  fetchReply: (
    threadId: string,
    input: FindInboundReplyInput,
  ) => Promise<LatestInboundReply | null>;
  classify: (input: {
    replyBody: string;
    scope: AiCallScope;
  }) => Promise<ReplyClassification>;
}

export async function buildReplyDetectionMetadata(
  input: BuildReplyMetadataInput,
): Promise<Record<string, unknown>> {
  const base = {
    gmailThreadId: input.threadId,
    gmailMessageId: input.originalMessageId,
  };

  if (!input.hasBodyScope) {
    return { ...base, classificationStatus: "skipped_missing_scope" };
  }

  try {
    const reply = await input.fetchReply(input.threadId, {
      originalMessageId: input.originalMessageId,
      senderAddress: input.senderAddress,
    });

    if (!reply?.body) {
      return {
        ...base,
        gmailMessageId: reply?.gmailMessageId ?? input.originalMessageId,
        classificationStatus: "skipped_empty_body",
      };
    }

    return await classifyReply(input, base, reply);
  } catch (err) {
    input.log.warn("reply body fetch failed", {
      opportunityId: input.opportunityId,
      threadId: input.threadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return failedMetadata(base, "body_fetch_failed");
  }
}

async function classifyReply(
  input: BuildReplyMetadataInput,
  base: Record<string, unknown>,
  reply: LatestInboundReply,
): Promise<Record<string, unknown>> {
  try {
    const result = await input.classify({
      replyBody: reply.body ?? "",
      scope: {
        runId: input.runId,
        userId: input.userId,
        callPurpose: "reply_classification",
      },
    });

    return {
      ...base,
      gmailMessageId: reply.gmailMessageId,
      classificationStatus: "classified",
      classification: result.classification,
      objectionTheme: result.objection_theme,
      classifiedAt: new Date().toISOString(),
    };
  } catch (err) {
    input.log.warn("reply classification failed", {
      opportunityId: input.opportunityId,
      threadId: input.threadId,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ...failedMetadata(base, "classification_failed"),
      gmailMessageId: reply.gmailMessageId,
    };
  }
}

function failedMetadata(
  base: Record<string, unknown>,
  errorLabel: string,
): Record<string, unknown> {
  return {
    ...base,
    classificationStatus: "failed",
    classificationError: errorLabel,
  };
}
