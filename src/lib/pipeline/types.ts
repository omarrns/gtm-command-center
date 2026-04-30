import type { DiscoverResult } from "@/lib/pipeline/steps/discover";
import type { ScoreResult } from "@/lib/pipeline/steps/score";
import type { ResearchResult } from "@/lib/pipeline/steps/research";
import type { EnrichResult } from "@/lib/pipeline/steps/enrich";
import type { DraftResult } from "@/lib/pipeline/steps/draft";

export interface PipelineRunResult {
  userId: string;
  startedAt: string;
  completedAt: string;
  discover: DiscoverResult;
  score: ScoreResult;
  research: ResearchResult;
  enrich: EnrichResult;
  draft: DraftResult;
  queuedRecovery: number;
  error: string | null;
}
