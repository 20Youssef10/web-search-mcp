import { McpServer }  from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }          from "zod";
import { ENGINES }    from "../constants.js";
import { serpApiRequest, formatJson } from "../services/http.js";
import { BaseSearchSchema } from "../schemas/common.js";
import type {
  BingSearchResponse,
  BingImagesResponse,
  BingNewsResponse,
} from "../types.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function buildSerpParams(query: string, extra: Record<string, unknown>) {
  return { api_key: process.env.SERPAPI_API_KEY!, q: query, ...extra };
}

// ─── 1. Bing Web Search ───────────────────────────────────────────────────────
export function registerBingSearch(server: McpServer): void {
  server.registerTool("bing_search", {
    title: "Bing Web Search",
    description: `Search the web using Microsoft Bing.

Args:
  - query: Search query
  - num: Results count (1–50, default 10)
  - page: Page number
  - lang: Language code ('en', 'ar', etc.)
  - country: Country/market code ('us', 'eg', etc.)
  - date_range: Recency — 'd' (day), 'w' (week), 'm' (month), 'y' (year)
  - response_format: 'markdown' or 'json'

Returns: Organic results with titles, URLs, snippets, and dates.`,
    inputSchema: BaseSearchSchema.extend({
      date_range: z.enum(["d","w","m","y"]).optional().describe("Recency filter"),
    }),
    annotations: READ_ONLY,
  }, async ({ query, num, page, lang, country, date_range, response_format }) => {
    const freshnessMap: Record<string, string> = { d: "Day", w: "Week", m: "Month", y: "Year" };

    const params = buildSerpParams(query, {
      engine: ENGINES.BING,
      count: num,
      first: (page - 1) * num + 1,
      mkt: `${lang}-${country.toUpperCase()}`,
      ...(date_range ? { freshness: freshnessMap[date_range] } : {}),
    });

    const data    = await serpApiRequest<BingSearchResponse>(params);
    const results = data.organic_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(results) }] };

    const text = results.length
      ? results.map(r => [
          `**${r.position}. [${r.title}](${r.link})**`,
          r.snippet ? `> ${r.snippet}` : "",
          r.date    ? `📅 ${r.date}` : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "No results found.";

    return { content: [{ type: "text", text: `## 🔵 Bing Search: "${query}"\n\n${text}` }] };
  });
}

// ─── 2. Bing Images ───────────────────────────────────────────────────────────
export function registerBingImages(server: McpServer): void {
  server.registerTool("bing_images_search", {
    title: "Bing Images Search",
    description: `Search Bing Images for photos and illustrations.

Args:
  - query: Image search query
  - num: Results count (1–50, default 10)
  - image_size: 'small', 'medium', 'large', 'wallpaper'
  - image_type: 'photo', 'clipart', 'line', 'transparent', 'shopping', 'animated'
  - image_color: 'coloronly', 'blackandwhite', 'red', 'blue', etc.
  - image_license: 'publicdomain', 'shareanduse', 'shareandusecomeercially', 'modify', 'modifycomercially'
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      query:         z.string().min(1).max(500),
      num:           z.number().int().min(1).max(50).default(10),
      lang:          z.string().length(2).default("en"),
      country:       z.string().length(2).default("us"),
      image_size:    z.enum(["small","medium","large","wallpaper"]).optional(),
      image_type:    z.enum(["photo","clipart","line","transparent","shopping","animated"]).optional(),
      image_color:   z.string().optional(),
      image_license: z.enum(["publicdomain","shareanduse","shareandusecomeercially","modify","modifycomercially"]).optional(),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, num, lang, country, image_size, image_type, image_color, image_license, response_format }) => {
    const params = buildSerpParams(query, {
      engine: ENGINES.BING_IMAGES,
      count: num,
      mkt: `${lang}-${country.toUpperCase()}`,
      ...(image_size    ? { qft: `+filterui:imagesize-${image_size}` }          : {}),
      ...(image_type    ? { qft: `+filterui:photo-${image_type}` }              : {}),
      ...(image_color   ? { qft: `+filterui:color2-${image_color}` }            : {}),
      ...(image_license ? { qft: `+filterui:license-${image_license}` }         : {}),
    });

    const data   = await serpApiRequest<BingImagesResponse>(params);
    const images = data.images_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(images) }] };

    const text = images.length
      ? images.map(img => [
          `**${img.position}. ${img.title}**`,
          `🖼️  Image: ${img.image ?? img.link}`,
          img.image_width ? `📐 ${img.image_width} × ${img.image_height}px` : "",
          `🔗 Source: [${img.source}](${img.link})`,
        ].filter(Boolean).join("\n")).join("\n\n")
      : "No images found.";

    return { content: [{ type: "text", text: `## 🔵🖼️ Bing Images: "${query}"\n\n${text}` }] };
  });
}

// ─── 3. Bing News ─────────────────────────────────────────────────────────────
export function registerBingNews(server: McpServer): void {
  server.registerTool("bing_news_search", {
    title: "Bing News Search",
    description: `Search Bing News for recent news articles from around the web.

Args:
  - query: News topic or keywords
  - num: Results count (1–50, default 10)
  - date_range: Recency — 'd' (day), 'w' (week), 'm' (month)
  - response_format: 'markdown' or 'json'`,
    inputSchema: BaseSearchSchema.extend({
      date_range: z.enum(["d","w","m"]).optional(),
    }),
    annotations: READ_ONLY,
  }, async ({ query, num, lang, country, date_range, response_format }) => {
    const freshnessMap: Record<string, string> = { d: "Day", w: "Week", m: "Month" };
    const params = buildSerpParams(query, {
      engine: ENGINES.BING_NEWS,
      count: num,
      mkt: `${lang}-${country.toUpperCase()}`,
      ...(date_range ? { freshness: freshnessMap[date_range] } : {}),
    });

    const data     = await serpApiRequest<BingNewsResponse>(params);
    const articles = data.organic_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(articles) }] };

    const text = articles.length
      ? articles.map(a => [
          `**${a.position}. [${a.title}](${a.link})**`,
          `📰 ${a.source ?? "Unknown"}${a.date ? ` · ${a.date}` : ""}`,
          a.snippet ? `> ${a.snippet}` : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "No news articles found.";

    return { content: [{ type: "text", text: `## 🔵📰 Bing News: "${query}"\n\n${text}` }] };
  });
}

// ─── 4. Bing Videos ───────────────────────────────────────────────────────────
export function registerBingVideos(server: McpServer): void {
  server.registerTool("bing_videos_search", {
    title: "Bing Videos Search",
    description: "Search Bing Videos for video content across the web.",
    inputSchema: BaseSearchSchema,
    annotations: READ_ONLY,
  }, async ({ query, num, lang, country, response_format }) => {
    const params = buildSerpParams(query, {
      engine: ENGINES.BING_VIDEOS,
      count: num,
      mkt: `${lang}-${country.toUpperCase()}`,
    });

    const data    = await serpApiRequest<{ video_results?: Record<string, unknown>[] }>(params);
    const videos  = data.video_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(videos) }] };

    const text = videos.length
      ? videos.map((v, i) => [
          `**${i + 1}. [${v["title"]}](${v["link"]})**`,
          v["source"]   ? `📺 ${v["source"]}` : "",
          v["duration"] ? `⏱️ ${v["duration"]}` : "",
          v["date"]     ? `📅 ${v["date"]}` : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "No video results found.";

    return { content: [{ type: "text", text: `## 🔵🎬 Bing Videos: "${query}"\n\n${text}` }] };
  });
}
