import type { UIMessage } from "ai";
import { runClaudeJson } from "@/lib/ai/anthropic";
import { EXTRACTION_SYSTEM_PROMPT } from "./extraction-prompt";

export interface ExtractionProfile {
  positioning: string;
  careerHighlights: string;
  proofPoints: string;
  technicalTools: string;
}

export interface ExtractionSearch {
  searchQueries: string[];
  searchLocations: string[];
  scoreThreshold: number;
  dailySendCap: number;
}

export interface ExtractionOutreach {
  greenFlags: string;
  redFlags: string;
  outreachTone: "casual" | "direct" | "formal";
  whatsWorked: string;
  whatToAvoid: string;
}

export interface ExtractionInsights {
  career_narrative: string;
  decision_drivers: string[];
  unstated_preferences: string[];
  strongest_stories: string[];
  positioning_alternatives: string[];
  risk_tolerance: string;
  communication_style_notes: string;
}

export interface ExtractionResult {
  profile: ExtractionProfile;
  search: ExtractionSearch;
  outreach: ExtractionOutreach;
  insights: ExtractionInsights;
}

/**
 * Format UIMessages into a plain-text transcript for extraction.
 */
function formatTranscript(messages: UIMessage[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "Coach" : "User";
    for (const part of msg.parts) {
      if (part.type === "text" && part.text.trim()) {
        lines.push(`${role}: ${part.text.trim()}`);
      }
    }
  }

  return lines.join("\n\n");
}

/**
 * Run Opus extraction on interview transcript.
 * Returns structured data matching wizard-compatible shapes + richer insights.
 */
export async function runExtractionFromTranscript(
  messages: UIMessage[],
): Promise<ExtractionResult> {
  const transcript = formatTranscript(messages);

  const result = await runClaudeJson<ExtractionResult>({
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: `<transcript>\n${transcript}\n</transcript>\n\nExtract the structured data from this interview transcript.`,
    model: "claude-opus-4-6",
    maxTokens: 4096,
  });

  // Validate and apply defaults for required fields
  return {
    profile: {
      positioning: result.profile?.positioning ?? "",
      careerHighlights: result.profile?.careerHighlights ?? "",
      proofPoints: result.profile?.proofPoints ?? "",
      technicalTools: result.profile?.technicalTools ?? "",
    },
    search: {
      searchQueries: Array.isArray(result.search?.searchQueries)
        ? result.search.searchQueries
        : ["Software Engineer"],
      searchLocations: Array.isArray(result.search?.searchLocations)
        ? result.search.searchLocations
        : ["Remote"],
      scoreThreshold:
        typeof result.search?.scoreThreshold === "number"
          ? result.search.scoreThreshold
          : 70,
      dailySendCap:
        typeof result.search?.dailySendCap === "number"
          ? result.search.dailySendCap
          : 10,
    },
    outreach: {
      greenFlags: result.outreach?.greenFlags ?? "",
      redFlags: result.outreach?.redFlags ?? "",
      outreachTone:
        result.outreach?.outreachTone &&
        ["casual", "direct", "formal"].includes(result.outreach.outreachTone)
          ? result.outreach.outreachTone
          : "casual",
      whatsWorked: result.outreach?.whatsWorked ?? "",
      whatToAvoid: result.outreach?.whatToAvoid ?? "",
    },
    insights: {
      career_narrative: result.insights?.career_narrative ?? "",
      decision_drivers: Array.isArray(result.insights?.decision_drivers)
        ? result.insights.decision_drivers
        : [],
      unstated_preferences: Array.isArray(result.insights?.unstated_preferences)
        ? result.insights.unstated_preferences
        : [],
      strongest_stories: Array.isArray(result.insights?.strongest_stories)
        ? result.insights.strongest_stories
        : [],
      positioning_alternatives: Array.isArray(
        result.insights?.positioning_alternatives,
      )
        ? result.insights.positioning_alternatives
        : [],
      risk_tolerance: result.insights?.risk_tolerance ?? "",
      communication_style_notes:
        result.insights?.communication_style_notes ?? "",
    },
  };
}
