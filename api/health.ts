import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(_req: VercelRequest, res: VercelResponse): void {
  res.status(200).json({
    status: "ok",
    service: "web-search-mcp-server",
    version: "1.2.0",
    total_tools: 26,
    engines: {
      serpapi:    { configured: !!process.env.SERPAPI_API_KEY,    tools: 20 },
      perplexity: { configured: !!process.env.PERPLEXITY_API_KEY, tools: 3  },
      youtube:    { configured: !!process.env.YOUTUBE_API_KEY,    tools: 3  },
    },
  });
}
