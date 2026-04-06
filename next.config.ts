import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep worker routes on the Node runtime for Anthropic/Exa/Firecrawl SDK compatibility.
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
