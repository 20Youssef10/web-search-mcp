import { McpServer }         from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }                 from "zod";
import axios, { AxiosError } from "axios";
import { CHARACTER_LIMIT }   from "../constants.js";

const READ_ONLY = {
  readOnlyHint:    true,
  destructiveHint: false,
  idempotentHint:  true,
  openWorldHint:   true,
};

const NEWS_BASE = "https://newsapi.org/v2";

// ─── API Key helper ───────────────────────────────────────────────────────────
function getApiKey(): string {
  const key = process.env.NEWSAPI_KEY;
  if (!key) throw new Error(
    "NEWSAPI_KEY is not set. Get a free key at https://newsapi.org/register"
  );
  return key;
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function newsGet<T>(
  endpoint: string,
  params: Record<string, unknown>
): Promise<T> {
  try {
    const res = await axios.get<T>(`${NEWS_BASE}/${endpoint}`, {
      params,
      headers: { "X-Api-Key": getApiKey() },
      timeout: 15_000,
    });
    return res.data;
  } catch (err) {
    if (err instanceof AxiosError) {
      const status  = err.response?.status;
      const data    = err.response?.data as Record<string, unknown> | undefined;
      const message = data?.message ?? err.message;
      if (status === 401) throw new Error("NewsAPI auth failed. Check your NEWSAPI_KEY.");
      if (status === 426) throw new Error("NewsAPI: free plan only supports headlines. Upgrade for full article search.");
      if (status === 429) throw new Error("NewsAPI rate limit exceeded (100 req/day on free plan).");
      if (status === 400) throw new Error(`NewsAPI bad request: ${message}`);
      throw new Error(`NewsAPI error (${status}): ${message}`);
    }
    throw err;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface NewsArticle {
  source:      { id: string | null; name: string };
  author:      string | null;
  title:       string;
  description: string | null;
  url:         string;
  urlToImage:  string | null;
  publishedAt: string;
  content:     string | null;
}

interface NewsResponse {
  status:       string;
  totalResults: number;
  articles:     NewsArticle[];
}

interface NewsSource {
  id:          string;
  name:        string;
  description: string;
  url:         string;
  category:    string;
  language:    string;
  country:     string;
}

interface NewsSourcesResponse {
  status:  string;
  sources: NewsSource[];
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function truncate(text: string): string {
  return text.length <= CHARACTER_LIMIT
    ? text
    : text.slice(0, CHARACTER_LIMIT) + "\n\n[... truncated]";
}

function formatArticles(articles: NewsArticle[], title: string): string {
  if (!articles.length) return "No articles found.";

  const lines = articles.map((a, i) => {
    const source = a.source.name;
    const date   = a.publishedAt.slice(0, 10);
    const author = a.author ? ` · ✍️ ${a.author.split(",")[0]}` : "";
    return [
      `**${i + 1}. [${a.title}](${a.url})**`,
      `📰 ${source}${author} · 📅 ${date}`,
      a.description ? `> ${a.description.slice(0, 200)}` : "",
    ].filter(Boolean).join("\n");
  });

  return `## ${title}\n\n${lines.join("\n\n")}`;
}

// Shared categories and languages for reuse
const CATEGORIES = ["business","entertainment","general","health","science","sports","technology"] as const;
const LANGUAGES  = ["ar","de","en","es","fr","he","it","nl","no","pt","ru","sv","ud","zh"] as const;
const COUNTRIES  = [
  "ae","ar","at","au","be","bg","br","ca","ch","cn","co","cu","cz","de",
  "eg","fr","gb","gr","hk","hu","id","ie","il","in","it","jp","kr","lt",
  "lv","ma","mx","my","ng","nl","no","nz","ph","pl","pt","ro","rs","ru",
  "sa","se","sg","si","sk","th","tr","tw","ua","us","ve","za",
] as const;

const SORT_BY = ["publishedAt","relevancy","popularity"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// 1. news_top_headlines — Breaking news and top headlines
// ─────────────────────────────────────────────────────────────────────────────
export function registerNewsTopHeadlines(server: McpServer): void {
  server.registerTool("news_top_headlines", {
    title: "Top Headlines",
    description: `Fetch top/breaking news headlines from NewsAPI.org.

Can filter by country, category, specific sources, or keyword query.
Available on the free plan (100 requests/day).

Args:
  - query: Optional keyword to filter headlines (e.g. "AI", "elections")
  - country: 2-letter country code — 'us', 'eg', 'sa', 'gb', 'ae', etc.
  - category: News category — business, entertainment, general, health, science, sports, technology
  - sources: Comma-separated source IDs (e.g. 'bbc-news,cnn'). Cannot combine with country/category.
  - num: Number of articles (1–100, default 20)
  - response_format: 'markdown' or 'json'

Returns: Headlines with title, source, author, date, description, and URL.`,
    inputSchema: z.object({
      query:           z.string().max(500).optional().describe("Keyword filter"),
      country:         z.enum(COUNTRIES).optional().describe("Country code: 'us', 'eg', 'sa', 'gb'"),
      category:        z.enum(CATEGORIES).optional().describe("Category: business|entertainment|general|health|science|sports|technology"),
      sources:         z.string().optional().describe("Source IDs e.g. 'bbc-news,cnn' (cannot use with country/category)"),
      num:             z.number().int().min(1).max(100).default(20),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, country, category, sources, num, response_format }) => {
    const params: Record<string, unknown> = { pageSize: num };
    if (query)    params["q"]        = query;
    if (sources)  params["sources"]  = sources;
    else {
      if (country)  params["country"]  = country;
      if (category) params["category"] = category;
    }

    const data = await newsGet<NewsResponse>("top-headlines", params);

    if (response_format === "json") {
      return { content: [{ type: "text", text: truncate(JSON.stringify({
        total: data.totalResults, articles: data.articles,
      }, null, 2)) }] };
    }

    const label = [
      query    ? `"${query}"` : "",
      country  ? `🌍 ${country.toUpperCase()}` : "",
      category ? `📂 ${category}` : "",
    ].filter(Boolean).join(" · ") || "Global";

    return { content: [{ type: "text", text: truncate(
      formatArticles(data.articles, `📰 Top Headlines — ${label} (${data.totalResults} total)`)
    ) }] };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. news_search — Full article search across all sources
// ─────────────────────────────────────────────────────────────────────────────
export function registerNewsSearch(server: McpServer): void {
  server.registerTool("news_search", {
    title: "News Article Search",
    description: `Search across all news articles indexed by NewsAPI (millions of articles).
Requires a paid NewsAPI plan for full access; free plan is limited to recent 30-day articles.

Args:
  - query: Search keywords — supports AND, OR, NOT and exact phrases e.g. 'Bitcoin AND "price drop"'
  - lang: Language code — 'ar', 'en', 'fr', 'de', 'es', 'zh', etc.
  - sort_by: Sort order — 'publishedAt' (newest), 'relevancy', 'popularity'
  - from_date: Start date ISO format 'YYYY-MM-DD'
  - to_date: End date ISO format 'YYYY-MM-DD'
  - sources: Comma-separated source IDs (e.g. 'bbc-news,al-jazeera-english')
  - domains: Comma-separated domains (e.g. 'bbc.co.uk,techcrunch.com')
  - num: Results count (1–100, default 20)
  - page: Page number for pagination
  - response_format: 'markdown' or 'json'

Returns: Articles with title, source, author, published date, description, and URL.`,
    inputSchema: z.object({
      query:           z.string().min(1).max(500).describe("Keywords — supports AND/OR/NOT, exact phrases"),
      lang:            z.enum(LANGUAGES).optional().describe("Language: 'ar','en','fr','de','es','zh'"),
      sort_by:         z.enum(SORT_BY).default("publishedAt"),
      from_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date YYYY-MM-DD"),
      to_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date YYYY-MM-DD"),
      sources:         z.string().optional().describe("Source IDs e.g. 'bbc-news,reuters'"),
      domains:         z.string().optional().describe("Domains e.g. 'bbc.co.uk,reuters.com'"),
      num:             z.number().int().min(1).max(100).default(20),
      page:            z.number().int().min(1).default(1),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, lang, sort_by, from_date, to_date, sources, domains, num, page, response_format }) => {
    const params: Record<string, unknown> = {
      q:        query,
      sortBy:   sort_by,
      pageSize: num,
      page,
    };
    if (lang)      params["language"] = lang;
    if (from_date) params["from"]     = from_date;
    if (to_date)   params["to"]       = to_date;
    if (sources)   params["sources"]  = sources;
    if (domains)   params["domains"]  = domains;

    const data = await newsGet<NewsResponse>("everything", params);

    if (response_format === "json") {
      return { content: [{ type: "text", text: truncate(JSON.stringify({
        total: data.totalResults, page, articles: data.articles,
      }, null, 2)) }] };
    }

    const header = `🔍 News Search: "${query}" (${data.totalResults.toLocaleString()} total · page ${page})`;
    return { content: [{ type: "text", text: truncate(formatArticles(data.articles, header)) }] };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. news_sources — List all available news sources
// ─────────────────────────────────────────────────────────────────────────────
export function registerNewsSources(server: McpServer): void {
  server.registerTool("news_sources", {
    title: "News Sources Directory",
    description: `List all news sources available in NewsAPI, filterable by category, language, and country.
Useful for discovering source IDs to use in news_top_headlines and news_search.

Args:
  - category: Filter by topic — business, entertainment, general, health, science, sports, technology
  - lang: Filter by language — 'ar', 'en', 'fr', etc.
  - country: Filter by country — 'us', 'eg', 'sa', 'gb', etc.
  - response_format: 'markdown' or 'json'

Returns: Source list with ID (use in other tools), name, description, category, and URL.`,
    inputSchema: z.object({
      category:        z.enum(CATEGORIES).optional(),
      lang:            z.enum(LANGUAGES).optional(),
      country:         z.enum(COUNTRIES).optional(),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ category, lang, country, response_format }) => {
    const params: Record<string, unknown> = {};
    if (category) params["category"] = category;
    if (lang)     params["language"] = lang;
    if (country)  params["country"]  = country;

    const data = await newsGet<NewsSourcesResponse>("top-headlines/sources", params);
    const sources = data.sources ?? [];

    if (response_format === "json") {
      return { content: [{ type: "text", text: truncate(JSON.stringify(sources, null, 2)) }] };
    }

    if (!sources.length) {
      return { content: [{ type: "text", text: "No sources found matching filters." }] };
    }

    const filters = [
      category ? `📂 ${category}` : "",
      lang     ? `🌐 ${lang}`     : "",
      country  ? `🌍 ${country.toUpperCase()}` : "",
    ].filter(Boolean).join(" · ") || "All";

    const lines = sources.map(s =>
      `- **${s.name}** \`${s.id}\` · ${s.category} · ${s.language}/${s.country}\n  ${s.description.slice(0, 120)}`
    );

    return { content: [{ type: "text", text: truncate(
      `## 📋 News Sources — ${filters} (${sources.length} sources)\n\n${lines.join("\n\n")}`
    ) }] };
  });
}
