import { z } from "zod";
import {
  CommentSchema,
  TranscriptSchema,
  VideoMetaSchema,
  VideoSourceSchema,
} from "@/lib/video-icp/yt-llm";
import { isYouTubeUrl } from "@/lib/video-icp/yt-llm";

export const videoIcpSubmitSchema = z.object({
  youtubeUrl: z
    .string()
    .trim()
    .url("Enter a valid YouTube URL.")
    .refine(isYouTubeUrl, "Enter a YouTube video URL."),
});

export const videoIcpJobPayloadSchema = z.object({
  review_id: z.string().uuid(),
});

export const videoIcpCommentsStatusSchema = z.enum([
  "not_requested",
  "fetched",
  "failed",
]);

export const videoIcpExtractionSchema = z.object({
  source: VideoSourceSchema,
  meta: VideoMetaSchema,
  transcript: TranscriptSchema,
  comments: z.array(CommentSchema).nullable(),
  commentsStatus: z.enum(["fetched", "failed"]),
  commentsError: z.string().nullable(),
});

const annotationSchema = z.object({
  startSec: z.number(),
  personaId: z.string(),
  reactionType: z.enum([
    "hook",
    "resonance",
    "bounce",
    "objection",
    "question",
    "cta",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  quote: z.string(),
  interpretation: z.string(),
  recommendedEdit: z.string(),
});

export const videoIcpAnalysisSchema = z.object({
  personas: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.string(),
        context: z.string(),
        priorities: z.array(z.string()),
        likelyObjections: z.array(z.string()),
      }),
    )
    .min(2)
    .max(3),
  overall: z.object({
    summary: z.string(),
    strongestMoments: z.array(annotationSchema),
    weakestMoments: z.array(annotationSchema),
    recommendedEdits: z.array(z.string()),
  }),
  timeline: z.array(annotationSchema),
  ctaFit: z.array(
    z.object({
      personaId: z.string(),
      fit: z.enum(["weak", "mixed", "strong"]),
      reasoning: z.string(),
      missingQuestions: z.array(z.string()),
    }),
  ),
});

export type VideoIcpSubmitInput = z.infer<typeof videoIcpSubmitSchema>;
export type VideoIcpJobPayload = z.infer<typeof videoIcpJobPayloadSchema>;
export type VideoIcpExtraction = z.infer<typeof videoIcpExtractionSchema>;
export type VideoIcpAnalysis = z.infer<typeof videoIcpAnalysisSchema>;
export type VideoIcpComment = z.infer<typeof CommentSchema>;
export type VideoIcpTranscript = z.infer<typeof TranscriptSchema>;
