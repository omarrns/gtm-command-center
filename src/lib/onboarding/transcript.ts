import type { UIMessage } from "ai";

export function formatTranscript(messages: UIMessage[]): string {
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
