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

export function buildServer(): McpServer {
  const server = new McpServer({
    name:    "web-search-mcp-server",
    version: "1.2.0",
  });

  // ── Google (10) ─────────────────────────────────────────────────────────────
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

  // ── Bing (4) ────────────────────────────────────────────────────────────────
  registerBingSearch(server);         // bing_search
  registerBingImages(server);         // bing_images_search
  registerBingNews(server);           // bing_news_search
  registerBingVideos(server);         // bing_videos_search

  // ── DuckDuckGo (2) ──────────────────────────────────────────────────────────
  registerDdgInstant(server);         // duckduckgo_instant_answer
  registerDdgSearch(server);          // duckduckgo_search

  // ── Other Engines (4) ───────────────────────────────────────────────────────
  registerYahooSearch(server);        // yahoo_search
  registerYandexSearch(server);       // yandex_search
  registerBaiduSearch(server);        // baidu_search
  registerMultiEngineSearch(server);  // multi_engine_search

  // ── Perplexity Sonar (3) ────────────────────────────────────────────────────
  registerPerplexitySearch(server);       // perplexity_search
  registerPerplexityDeepResearch(server); // perplexity_deep_research
  registerPerplexityNews(server);         // perplexity_news

  // ── YouTube (3) ─────────────────────────────────────────────────────────────
  registerYoutubeSearch(server);          // youtube_search
  registerYoutubeVideoDetails(server);    // youtube_video_details
  registerYoutubeChannelInfo(server);     // youtube_channel_info

  return server;
}
