import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  registerGoogleSearch, registerGoogleAiSearch, registerGoogleVideos,
  registerGoogleFinance, registerGoogleJobs,    registerGooglePatents,
} from "./tools/google.js";

import {
  registerGoogleImages, registerGoogleNews,
  registerGoogleScholar, registerGoogleMaps,
} from "./tools/google-media.js";

import {
  registerBingSearch, registerBingImages,
  registerBingNews,   registerBingVideos,
} from "./tools/bing.js";

import { registerDdgInstant, registerDdgSearch } from "./tools/duckduckgo.js";

import {
  registerYahooSearch, registerYandexSearch,
  registerBaiduSearch, registerMultiEngineSearch,
} from "./tools/other-engines.js";

import {
  registerPerplexitySearch,
  registerPerplexityDeepResearch,
  registerPerplexityNews,
} from "./tools/perplexity.js";

import {
  registerYoutubeSearch,
  registerYoutubeVideoDetails,
  registerYoutubeChannelInfo,
} from "./tools/youtube.js";

import {
  registerNewsTopHeadlines,
  registerNewsSearch,
  registerNewsSources,
} from "./tools/newsapi.js";

export function buildServer(): McpServer {
  const server = new McpServer({
    name:    "web-search-mcp-server",
    version: "1.3.0",
  });

  // ── Google (10) ─────────────────────────────────────────────────────────────
  registerGoogleSearch(server);
  registerGoogleAiSearch(server);
  registerGoogleImages(server);
  registerGoogleNews(server);
  registerGoogleScholar(server);
  registerGoogleVideos(server);
  registerGoogleFinance(server);
  registerGoogleJobs(server);
  registerGooglePatents(server);
  registerGoogleMaps(server);

  // ── Bing (4) ────────────────────────────────────────────────────────────────
  registerBingSearch(server);
  registerBingImages(server);
  registerBingNews(server);
  registerBingVideos(server);

  // ── DuckDuckGo (2) ──────────────────────────────────────────────────────────
  registerDdgInstant(server);
  registerDdgSearch(server);

  // ── Other Engines (4) ───────────────────────────────────────────────────────
  registerYahooSearch(server);
  registerYandexSearch(server);
  registerBaiduSearch(server);
  registerMultiEngineSearch(server);

  // ── Perplexity Sonar (3) ────────────────────────────────────────────────────
  registerPerplexitySearch(server);
  registerPerplexityDeepResearch(server);
  registerPerplexityNews(server);

  // ── YouTube (3) ─────────────────────────────────────────────────────────────
  registerYoutubeSearch(server);
  registerYoutubeVideoDetails(server);
  registerYoutubeChannelInfo(server);

  // ── NewsAPI (3) ─────────────────────────────────────────────────────────────
  registerNewsTopHeadlines(server);
  registerNewsSearch(server);
  registerNewsSources(server);

  return server;
}
