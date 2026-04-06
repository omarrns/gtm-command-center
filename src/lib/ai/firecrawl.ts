/**
 * Minimal Firecrawl client for fetching and extracting text from URLs.
 */

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

function getKey() {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set.");
  return key;
}

export async function firecrawlScrape(url: string): Promise<string> {
  const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getKey()}`,
    },
    body: JSON.stringify({ url, formats: ["markdown"] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firecrawl scrape failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    data?: { markdown?: string; content?: string };
  };
  return data.data?.markdown ?? data.data?.content ?? "";
}
