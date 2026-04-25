/**
 * Minimal Exa client for web search and crawling.
 * Uses fetch directly — avoids the SDK to keep bundle size small and work on
 * the Node runtime inside the worker route.
 */

const EXA_BASE = "https://api.exa.ai";

export const WEBSETS_BASE = "https://api.exa.ai/websets/v0";

function getKey() {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY is not set.");
  return key;
}

export interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  score?: number;
}

export async function exaSearch({
  query,
  numResults = 10,
  includeDomains,
  excludeDomains,
  includeText = true,
}: {
  query: string;
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  includeText?: boolean;
}): Promise<ExaSearchResult[]> {
  const res = await fetch(`${EXA_BASE}/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": getKey(),
    },
    body: JSON.stringify({
      query,
      numResults,
      includeDomains,
      excludeDomains,
      contents: includeText
        ? { text: { maxCharacters: 3000 }, highlights: true }
        : undefined,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Exa search failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { results: ExaSearchResult[] };
  return data.results ?? [];
}

export async function exaFindCompany(companyName: string) {
  const [overview, funding, news] = await Promise.all([
    exaSearch({
      query: `${companyName} company overview what they do product`,
      numResults: 5,
    }),
    exaSearch({
      query: `${companyName} funding round Series investors Crunchbase`,
      numResults: 5,
    }),
    exaSearch({
      query: `${companyName} recent news launch hiring`,
      numResults: 5,
    }),
  ]);
  return { overview, funding, news };
}

export function formatExaResults(results: ExaSearchResult[], label: string) {
  if (!results.length) return `### ${label}\n(no results)\n`;
  return (
    `### ${label}\n\n` +
    results
      .map(
        (r, i) =>
          `${i + 1}. **${r.title}** — ${r.url}\n   ${(r.text ?? "").slice(0, 500)}`,
      )
      .join("\n\n")
  );
}
