import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "../src/server.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  if (req.method === "GET") {
    res.status(200).json({
      status:  "ok",
      version: "1.3.0",
      tools:   29,
      serpapi_configured:    !!process.env.SERPAPI_API_KEY,
      perplexity_configured: !!process.env.PERPLEXITY_API_KEY,
      youtube_configured:    !!process.env.YOUTUBE_API_KEY,
      newsapi_configured:    !!process.env.NEWSAPI_KEY,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  try {
    const server    = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => { transport.close().catch(() => {}); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[web-search-mcp] error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
}
