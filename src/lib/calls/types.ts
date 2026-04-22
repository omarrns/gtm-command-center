export type CallStage =
  | "Renewal"
  | "Closed Won"
  | "Technical Evaluation"
  | "Demo";

export type CallOutcome = "ongoing" | "won" | "lost";

export interface CallObjection {
  type: string;
  responseRating: string;
  quote: string;
  repResponse: string;
}

export interface CallAnalysis {
  summary: string;
  keyInsights: string[];
  coachingNotes: string[];
  objections: CallObjection[];
  painPoints: string[];
}

export interface SalesCall {
  id: string;
  title: string;
  duration: string;
  rep: string;
  account: string;
  stage: CallStage;
  amount: number;
  date: string;
  objectionCount: number;
  painPointCount: number;
  redFlagCount: number;
  outcome: CallOutcome;
  analysis: CallAnalysis;
  transcript: string;
}
