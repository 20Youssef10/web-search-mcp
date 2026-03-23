import { McpServer }  from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }          from "zod";
import { ENGINES }    from "../constants.js";
import { serpApiRequest, formatJson } from "../services/http.js";
import { BaseSearchSchema } from "../schemas/common.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

function buildSerpParams(query: string, extra: Record<string, unknown>) {
  return { api_key: process.env.SERPAPI_API_KEY!, q: query, ...extra };
}

type OrganicResult = Record<string, unknown>;
type SearchData    = { organic_results?: OrganicResult[]; results?: OrganicResult[] };

function renderResults(results: OrganicResult[], query: string, prefix: string): string {
  const text = results.length
    ? results.map((r, i) => [
        `**${i + 1}. [${r["title"]}](${r["link"]})**`,
        r["snippet"] ? `> ${r["snippet"]}` : "",
        r["date"]    ? `📅 ${r["date"]}` : "",
      ].filter(Boolean).join("\n")).join("\n\n")
    : "No results found.";
  return `## ${prefix} "${query}"\n\n${text}`;
}

// ─── 1. Yahoo Search ──────────────────────────────────────────────────────────
export function registerYahooSearch(server: McpServer): void {
  server.registerTool("yahoo_search", {
    title: "Yahoo Web Search",
    description: "Search the web using Yahoo Search via SerpAPI.",
    inputSchema: BaseSearchSchema,
    annotations: READ_ONLY,
  }, async ({ query, num, response_format }) => {
    const params   = buildSerpParams(query, { engine: ENGINES.YAHOO });
    const data     = await serpApiRequest<SearchData>(params);
    const results  = (data.organic_results ?? []).slice(0, num);

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(results) }] };
    return { content: [{ type: "text", text: renderResults(results, query, "🟣 Yahoo:") }] };
  });
}

// ─── 2. Yandex Search ─────────────────────────────────────────────────────────
export function registerYandexSearch(server: McpServer): void {
  server.registerTool("yandex_search", {
    title: "Yandex Web Search",
    description: "Search the web using Yandex — best for Russian-language content and Eastern Europe.",
    inputSchema: BaseSearchSchema,
    annotations: READ_ONLY,
  }, async ({ query, num, response_format }) => {
    const params  = buildSerpParams(query, { engine: ENGINES.YANDEX });
    const data    = await serpApiRequest<SearchData>(params);
    const results = (data.organic_results ?? []).slice(0, num);

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(results) }] };
    return { content: [{ type: "text", text: renderResults(results, query, "🔴 Yandex:") }] };
  });
}

// ─── 3. Baidu Search ──────────────────────────────────────────────────────────
export function registerBaiduSearch(server: McpServer): void {
  server.registerTool("baidu_search", {
    title: "Baidu Web Search",
    description: "Search the web using Baidu — China's largest search engine. Best for Chinese-language content.",
    inputSchema: BaseSearchSchema,
    annotations: READ_ONLY,
  }, async ({ query, num, response_format }) => {
    const params  = buildSerpParams(query, { engine: ENGINES.BAIDU });
    const data    = await serpApiRequest<SearchData>(params);
    const results = (data.organic_results ?? []).slice(0, num);

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(results) }] };
    return { content: [{ type: "text", text: renderResults(results, query, "🔵 Baidu:") }] };
  });
}

// ─── 4. Multi-Engine Search (search all engines at once) ──────────────────────
export function registerMultiEngineSearch(server: McpServer): void {
  server.registerTool("multi_engine_search", {
    title: "Multi-Engine Search",
    description: `Search multiple engines simultaneously and combine results.
Runs the same query on Google, Bing, and DuckDuckGo and merges the top results.

Args:
  - query: Search query
  - engines: Which engines to include (default: all three)
  - num_per_engine: Results per engine (1–10)
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      query:           z.string().min(1).max(500),
      engines:         z.array(z.enum(["google","bing","duckduckgo"])).default(["google","bing","duckduckgo"]),
      num_per_engine:  z.number().int().min(1).max(10).default(5),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, engines, num_per_engine, response_format }) => {
    const engineMap: Record<string, string> = {
      google:     ENGINES.GOOGLE,
      bing:       ENGINES.BING,
      duckduckgo: ENGINES.DUCKDUCKGO,
    };
    const emojiMap: Record<string, string> = {
      google: "🔍 Google", bing: "🔵 Bing", duckduckgo: "🦆 DuckDuckGo",
    };

    const allResults: Record<string, OrganicResult[]> = {};

    await Promise.allSettled(
      engines.map(async (eng) => {
        const params = buildSerpParams(query, {
          engine: engineMap[eng],
          num:    num_per_engine,
        });
        const data = await serpApiRequest<SearchData>(params);
        allResults[eng] = (data.organic_results ?? []).slice(0, num_per_engine);
      })
    );

    if (response_format === "json") {
      return { content: [{ type: "text", text: formatJson(allResults) }] };
    }

    const parts: string[] = [`## 🌐 Multi-Engine Search: "${query}"\n`];
    for (const eng of engines) {
      const results = allResults[eng] ?? [];
      parts.push(`### ${emojiMap[eng] ?? eng}\n`);
      if (!results.length) {
        parts.push("_No results_\n");
      } else {
        parts.push(results.map((r, i) => `${i + 1}. **[${r["title"]}](${r["link"]})**${r["snippet"] ? `\n> ${String(r["snippet"]).slice(0, 150)}` : ""}`).join("\n\n"));
      }
      parts.push("\n");
    }

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}
