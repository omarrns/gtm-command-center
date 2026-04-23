import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  experimental: {
    // Keep worker routes on the Node runtime for Anthropic/Exa/Firecrawl SDK compatibility.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default withWorkflow(nextConfig);
