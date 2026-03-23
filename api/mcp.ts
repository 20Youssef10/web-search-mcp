/**
 * Vercel Serverless Function — MCP endpoint
 * Route: POST /api/mcp
 *
 * Each request creates a fresh stateless MCP transport (no session state).
 * Authentication: Bearer token or x-api-key header checked against MCP_API_KEY env var.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer }  from "../src/server.js";
import { authenticate } from "../src/middleware.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // ── Health check ────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    res.status(200).json({
      status: "ok",
      service: "web-search-mcp-server",
      version: "1.0.0",
      tools: 20,
      engines: ["google","bing","duckduckgo","yahoo","yandex","baidu"],
      serpapi_configured: !!process.env.SERPAPI_API_KEY,
    });
    return;
  }

  // ── Only POST from here ─────────────────────────────────────────────────────
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  // ── Authentication ──────────────────────────────────────────────────────────
  if (!authenticate(req, res)) return;

  // ── Warn if SerpAPI key is missing ──────────────────────────────────────────
  if (!process.env.SERPAPI_API_KEY) {
    console.warn("[web-search-mcp] SERPAPI_API_KEY not set — most tools will fail.");
  }

  // ── Handle MCP request ──────────────────────────────────────────────────────
  try {
    const server    = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[web-search-mcp] Unhandled error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
