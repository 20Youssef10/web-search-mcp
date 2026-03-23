import { McpServer }  from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }          from "zod";
import { ENGINES }    from "../constants.js";
import { serpApiRequest, formatJson } from "../services/http.js";
import { BaseSearchSchema, NumResultsSchema, ResponseFormatSchema } from "../schemas/common.js";
import type {
  GoogleImagesResponse,
  GoogleNewsResponse,
  GoogleScholarResponse,
} from "../types.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function buildSerpParams(query: string, extra: Record<string, unknown>) {
  return { api_key: process.env.SERPAPI_API_KEY!, q: query, ...extra };
}

// ─── 1. Google Images ─────────────────────────────────────────────────────────
export function registerGoogleImages(server: McpServer): void {
  server.registerTool("google_images_search", {
    title: "Google Images Search",
    description: `Search Google Images and return image URLs, titles, dimensions, and source pages.

Args:
  - query: Image search query
  - num: Number of image results (1–100, default 10)
  - image_size: Filter by size — 'large', 'medium', 'icon'
  - image_type: Filter by type — 'face', 'photo', 'clipart', 'lineart', 'animated'
  - image_color: Filter by color (e.g., 'red', 'black', 'white', 'color', 'gray')
  - safe: Safe search level
  - response_format: 'markdown' or 'json'

Returns: List of images with titles, direct URLs, thumbnails, and source links.`,
    inputSchema: z.object({
      query:        z.string().min(1).max(500),
      num:          NumResultsSchema,
      lang:         z.string().length(2).default("en"),
      country:      z.string().length(2).default("us"),
      image_size:   z.enum(["large","medium","icon"]).optional(),
      image_type:   z.enum(["face","photo","clipart","lineart","animated"]).optional(),
      image_color:  z.string().optional().describe("Color filter, e.g. 'red', 'black', 'white'"),
      safe:         z.enum(["active","moderate","off"]).default("moderate"),
      response_format: ResponseFormatSchema,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, num, lang, country, image_size, image_type, image_color, safe, response_format }) => {
    const tbsArr: string[] = [];
    if (image_size)  tbsArr.push(`isz:${image_size.charAt(0)}`);
    if (image_type)  tbsArr.push(`itp:${image_type}`);
    if (image_color) tbsArr.push(`ic:specific,isc:${image_color}`);

    const params = buildSerpParams(query, {
      engine: ENGINES.GOOGLE_IMAGES,
      num,
      hl: lang,
      gl: country,
      safe,
      ...(tbsArr.length ? { tbs: tbsArr.join(",") } : {}),
    });

    const data    = await serpApiRequest<GoogleImagesResponse>(params);
    const images  = data.images_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(images) }] };

    const text = images.length
      ? images.map(img => [
          `**${img.position}. ${img.title}**`,
          `🖼️  Original: ${img.original}`,
          img.original_width ? `📐 ${img.original_width} × ${img.original_height}px` : "",
          `🔗 Source: [${img.source}](${img.link})`,
        ].filter(Boolean).join("\n")).join("\n\n")
      : "No images found.";

    return { content: [{ type: "text", text: `## 🖼️ Google Images: "${query}"\n\n${text}` }] };
  });
}

// ─── 2. Google News ───────────────────────────────────────────────────────────
export function registerGoogleNews(server: McpServer): void {
  server.registerTool("google_news_search", {
    title: "Google News Search",
    description: `Search Google News for recent articles and headlines.

Args:
  - query: News topic or keywords
  - num: Number of articles (1–100, default 10)
  - lang: Language code ('en', 'ar', etc.)
  - country: Country code ('us', 'eg', etc.)
  - date_range: Recency — 'd' (last 24h), 'w' (week), 'm' (month), 'y' (year)
  - response_format: 'markdown' or 'json'

Returns: News articles with title, source, date, snippet, and URL.`,
    inputSchema: BaseSearchSchema.extend({
      date_range: z.enum(["d","w","m","y"]).optional().describe("Recency: d=24h, w=week, m=month, y=year"),
    }),
    annotations: READ_ONLY,
  }, async ({ query, num, page, lang, country, date_range, response_format }) => {
    const params = buildSerpParams(query, {
      engine: ENGINES.GOOGLE_NEWS,
      num,
      start: (page - 1) * num,
      hl: lang,
      gl: country,
      ...(date_range ? { tbs: `qdr:${date_range}` } : {}),
    });

    const data    = await serpApiRequest<GoogleNewsResponse>(params);
    const articles = data.news_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(articles) }] };

    const text = articles.length
      ? articles.map(a => [
          `**${a.position}. [${a.title}](${a.link})**`,
          `📰 ${a.source}${a.date ? ` · ${a.date}` : ""}`,
          a.snippet ? `> ${a.snippet}` : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "No news articles found.";

    return { content: [{ type: "text", text: `## 📰 Google News: "${query}"\n\n${text}` }] };
  });
}

// ─── 3. Google Scholar ────────────────────────────────────────────────────────
export function registerGoogleScholar(server: McpServer): void {
  server.registerTool("google_scholar_search", {
    title: "Google Scholar Search",
    description: `Search Google Scholar for academic papers, research articles, and citations.

Args:
  - query: Research topic or paper title
  - num: Results count (1–20, default 10)
  - year_from: Filter results published from this year
  - year_to: Filter results published until this year
  - cite_id: Get citing articles for a specific paper by result_id
  - as_review: If true, return only review articles
  - response_format: 'markdown' or 'json'

Returns: Papers with title, authors, publication info, citation count, and PDF link.`,
    inputSchema: z.object({
      query:           z.string().min(1).max(500).describe("Research query or paper title"),
      num:             z.number().int().min(1).max(20).default(10),
      page:            z.number().int().min(1).default(1),
      year_from:       z.number().int().min(1900).optional().describe("Filter: published from year"),
      year_to:         z.number().int().max(2030).optional().describe("Filter: published up to year"),
      cite_id:         z.string().optional().describe("Get papers citing this Scholar result_id"),
      as_review:       z.boolean().default(false).describe("Return only review articles"),
      response_format: ResponseFormatSchema,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, num, page, year_from, year_to, cite_id, as_review, response_format }) => {
    const params = buildSerpParams(query, {
      engine: ENGINES.GOOGLE_SCHOLAR,
      num,
      start: (page - 1) * num,
      ...(year_from  ? { as_ylo: year_from } : {}),
      ...(year_to    ? { as_yhi: year_to }   : {}),
      ...(cite_id    ? { cites: cite_id }     : {}),
      ...(as_review  ? { as_rr: 1 }           : {}),
    });

    const data    = await serpApiRequest<GoogleScholarResponse>(params);
    const papers  = data.organic_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(papers) }] };

    const text = papers.length
      ? papers.map((p, i) => {
          const authors   = p.publication_info?.authors?.map(a => a.name).join(", ") ?? "";
          const pubInfo   = p.publication_info?.summary ?? "";
          const cited     = p.inline_links?.cited_by?.total;
          const pdfLink   = p.inline_links?.pdf?.link;
          return [
            `**${i + 1}. [${p.title}](${p.link ?? "#"})**`,
            authors  ? `👤 ${authors}` : "",
            pubInfo  ? `📖 ${pubInfo}` : "",
            p.snippet ? `> ${p.snippet.slice(0, 300)}` : "",
            cited    ? `📊 Cited by ${cited}` : "",
            pdfLink  ? `📄 [PDF](${pdfLink})` : "",
          ].filter(Boolean).join("\n");
        }).join("\n\n")
      : "No academic results found.";

    return { content: [{ type: "text", text: `## 🎓 Google Scholar: "${query}"\n\n${text}` }] };
  });
}

// ─── 4. Google Maps ───────────────────────────────────────────────────────────
export function registerGoogleMaps(server: McpServer): void {
  server.registerTool("google_maps_search", {
    title: "Google Maps Search",
    description: `Search Google Maps for local businesses, places, and locations.

Args:
  - query: Search term (e.g., 'coffee shops Cairo')
  - ll: Lat/lng coordinates — format '@lat,lng,zoom' (e.g., '@30.0444,31.2357,14z')
  - type: Result type — 'search' (default) or 'place'
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      query:           z.string().min(1).describe("Place or business query"),
      ll:              z.string().optional().describe("Lat/lng: '@lat,lng,14z', e.g. '@30.0444,31.2357,14z'"),
      response_format: ResponseFormatSchema,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, ll, response_format }) => {
    const params = buildSerpParams(query, {
      engine: ENGINES.GOOGLE_MAPS,
      type: "search",
      ...(ll ? { ll } : {}),
    });

    const data    = await serpApiRequest<{ local_results?: Record<string, unknown>[] }>(params);
    const places  = data.local_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(places) }] };

    const text = places.length
      ? places.map((p, i) => [
          `**${i + 1}. ${p["title"]}**`,
          p["rating"] ? `⭐ ${p["rating"]} (${p["reviews"]} reviews)` : "",
          p["address"] ? `📍 ${p["address"]}` : "",
          p["phone"]   ? `📞 ${p["phone"]}` : "",
          p["website"] ? `🌐 ${p["website"]}` : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "No places found.";

    return { content: [{ type: "text", text: `## 🗺️ Google Maps: "${query}"\n\n${text}` }] };
  });
}
