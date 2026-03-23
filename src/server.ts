import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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

export function buildServer(): McpServer {
  const server = new McpServer({
    name: "web-search-mcp-server",
    version: "1.0.0",
  });

  // ── Google ──────────────────────────────
  registerGoogleSearch(server);       // google_search
  registerGoogleAiSearch(server);     // google_ai_search
  registerGoogleImages(server);       // google_images_search
  registerGoogleNews(server);         // google_news_search
  registerGoogleScholar(server);      // google_scholar_search
  registerGoogleVideos(server);       // google_videos_search
  registerGoogleFinance(server);      // google_finance_search
  registerGoogleJobs(server);         // google_jobs_search
  registerGooglePatents(server);      // google_patents_search
  registerGoogleMaps(server);         // google_maps_search

  // ── Bing ────────────────────────────────
  registerBingSearch(server);         // bing_search
  registerBingImages(server);         // bing_images_search
  registerBingNews(server);           // bing_news_search
  registerBingVideos(server);         // bing_videos_search

  // ── DuckDuckGo ──────────────────────────
  registerDdgInstant(server);         // duckduckgo_instant_answer
  registerDdgSearch(server);          // duckduckgo_search

  // ── Other Engines ────────────────────────
  registerYahooSearch(server);        // yahoo_search
  registerYandexSearch(server);       // yandex_search
  registerBaiduSearch(server);        // baidu_search

  // ── Multi-Engine ─────────────────────────
  registerMultiEngineSearch(server);  // multi_engine_search

  return server;
}
