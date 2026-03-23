#!/usr/bin/env node
import { McpServer }            from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express                  from "express";

// ─── Tool Registrars ──────────────────────────────────────────────────────────
import {
  registerGoogleSearch,
  registerGoogleAiSearch,
  registerGoogleVideos,
  registerGoogleFinance,
  registerGoogleJobs,
  registerGooglePatents,
} from "./tools/google.js";

import {
  registerGoogleImages,
  registerGoogleNews,
  registerGoogleScholar,
  registerGoogleMaps,
} from "./tools/google-media.js";

import {
  registerBingSearch,
  registerBingImages,
  registerBingNews,
  registerBingVideos,
} from "./tools/bing.js";

import {
  registerDdgInstant,
  registerDdgSearch,
} from "./tools/duckduckgo.js";

import {
  registerYahooSearch,
  registerYandexSearch,
  registerBaiduSearch,
  registerMultiEngineSearch,
} from "./tools/other-engines.js";

// ─── Validate API Key ─────────────────────────────────────────────────────────
function validateEnv(): void {
  if (!process.env.SERPAPI_API_KEY) {
    console.error(
      "[web-search-mcp] WARNING: SERPAPI_API_KEY is not set.\n" +
      "Most tools require a SerpAPI key. Get one at https://serpapi.com/\n" +
      "DuckDuckGo Instant Answer (duckduckgo_instant_answer) works without a key."
    );
  }
}

// ─── Build Server ─────────────────────────────────────────────────────────────
function buildServer(): McpServer {
  const server = new McpServer({
    name: "web-search-mcp-server",
    version: "1.0.0",
  });

  // ── Google ──────────────────────────────
  registerGoogleSearch(server);      // google_search
  registerGoogleAiSearch(server);    // google_ai_search
  registerGoogleImages(server);      // google_images_search
  registerGoogleNews(server);        // google_news_search
  registerGoogleScholar(server);     // google_scholar_search
  registerGoogleVideos(server);      // google_videos_search
  registerGoogleFinance(server);     // google_finance_search
  registerGoogleJobs(server);        // google_jobs_search
  registerGooglePatents(server);     // google_patents_search
  registerGoogleMaps(server);        // google_maps_search

  // ── Bing ────────────────────────────────
  registerBingSearch(server);        // bing_search
  registerBingImages(server);        // bing_images_search
  registerBingNews(server);          // bing_news_search
  registerBingVideos(server);        // bing_videos_search

  // ── DuckDuckGo ──────────────────────────
  registerDdgInstant(server);        // duckduckgo_instant_answer (no key needed)
  registerDdgSearch(server);         // duckduckgo_search

  // ── Other Engines ────────────────────────
  registerYahooSearch(server);       // yahoo_search
  registerYandexSearch(server);      // yandex_search
  registerBaiduSearch(server);       // baidu_search

  // ── Multi-Engine ─────────────────────────
  registerMultiEngineSearch(server); // multi_engine_search

  return server;
}

// ─── stdio Transport ──────────────────────────────────────────────────────────
async function runStdio(): Promise<void> {
  validateEnv();
  const server    = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[web-search-mcp] Running on stdio — 20 tools ready.");
}

// ─── HTTP Transport (for Vercel / Cloudflare / remote use) ───────────────────
async function runHTTP(): Promise<void> {
  validateEnv();
  const server = buildServer();
  const app    = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", tools: 20 });
  });

  const port = parseInt(process.env.PORT ?? "3000");
  app.listen(port, () => {
    console.error(`[web-search-mcp] HTTP server running on http://localhost:${port}/mcp`);
  });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
const transport = process.env.TRANSPORT ?? "stdio";
if (transport === "http") {
  runHTTP().catch((err: unknown) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err: unknown) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
