import { McpServer }  from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }          from "zod";
import { ENGINES }    from "../constants.js";
import { serpApiRequest, formatJson } from "../services/http.js";
import { BaseSearchSchema, SafeSearchSchema } from "../schemas/common.js";
import type {
  GoogleSearchResponse,
  GoogleAiResponse,
  GoogleOrganicResult,
} from "../types.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildSerpParams(query: string, extra: Record<string, unknown>) {
  return {
    api_key: process.env.SERPAPI_API_KEY!,
    q: query,
    ...extra,
  };
}

function formatOrganicResults(results: GoogleOrganicResult[]): string {
  return results
    .map(r => [
      `**${r.position}. [${r.title}](${r.link})**`,
      r.snippet ? `> ${r.snippet}` : "",
      r.date    ? `📅 ${r.date}` : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

// ─── 1. Google Web Search ─────────────────────────────────────────────────────
export function registerGoogleSearch(server: McpServer): void {
  server.registerTool("google_search", {
    title: "Google Web Search",
    description: `Search Google and return organic web results, answer boxes, and knowledge graph data.

Args:
  - query: Search query
  - num: Results count (1–100, default 10)
  - page: Page number (default 1)
  - lang: Language code (default 'en')
  - country: Country code (default 'us')
  - site: Restrict to a specific site (e.g., 'github.com')
  - date_range: Filter by date — 'd' (day), 'w' (week), 'm' (month), 'y' (year)
  - response_format: 'markdown' or 'json'

Returns: Organic results with titles, URLs, snippets, and optional answer box.`,
    inputSchema: BaseSearchSchema.extend({
      site:       z.string().optional().describe("Restrict to domain, e.g. 'stackoverflow.com'"),
      date_range: z.enum(["d","w","m","y"]).optional().describe("Recency filter: d=day, w=week, m=month, y=year"),
      safe:       SafeSearchSchema,
    }),
    annotations: READ_ONLY,
  }, async ({ query, num, page, lang, country, site, date_range, safe, response_format }) => {
    const q = site ? `site:${site} ${query}` : query;
    const params = buildSerpParams(q, {
      engine: ENGINES.GOOGLE,
      num,
      start: (page - 1) * num,
      hl: lang,
      gl: country,
      safe,
      ...(date_range ? { tbs: `qdr:${date_range}` } : {}),
    });

    const data = await serpApiRequest<GoogleSearchResponse>(params);
    const results = data.organic_results ?? [];

    if (response_format === "json") {
      return { content: [{ type: "text", text: formatJson({ organic_results: results, answer_box: data.answer_box, knowledge_graph: data.knowledge_graph }) }] };
    }

    const parts: string[] = [`## Google Search: "${query}"\n`];

    if (data.answer_box) {
      const ab = data.answer_box as Record<string, unknown>;
      parts.push(`### 📦 Answer Box\n${ab.answer ?? ab.snippet ?? JSON.stringify(ab)}\n`);
    }

    if (data.knowledge_graph) {
      const kg = data.knowledge_graph as Record<string, unknown>;
      if (kg.title) parts.push(`### 🧠 Knowledge Graph: ${kg.title}\n${kg.description ?? ""}\n`);
    }

    if (!results.length) {
      parts.push("No results found.");
    } else {
      parts.push("### 🔗 Organic Results\n");
      parts.push(formatOrganicResults(results));
    }

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}

// ─── 2. Google AI Overview (AI Mode) ─────────────────────────────────────────
export function registerGoogleAiSearch(server: McpServer): void {
  server.registerTool("google_ai_search", {
    title: "Google AI Overview / AI Mode Search",
    description: `Search Google and retrieve the AI Overview (AI-generated summary) along with organic results.

Returns the AI-generated answer blocks with sources, plus regular organic results.
Best for getting quick AI-synthesized answers on complex topics.

Args:
  - query: Question or topic
  - lang: Language code
  - country: Country code
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      query:           z.string().min(1).max(500).describe("Question or search query"),
      lang:            z.string().length(2).default("en"),
      country:         z.string().length(2).default("us"),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, lang, country, response_format }) => {
    const params = buildSerpParams(query, {
      engine: ENGINES.GOOGLE,
      hl: lang,
      gl: country,
    });

    const data = await serpApiRequest<GoogleAiResponse>(params);

    if (response_format === "json") {
      return { content: [{ type: "text", text: formatJson({ ai_overview: data.ai_overview, organic_results: data.organic_results?.slice(0, 5) }) }] };
    }

    const parts: string[] = [`## 🤖 Google AI Overview: "${query}"\n`];

    const aiOverview = data.ai_overview;
    if (aiOverview?.text_blocks?.length) {
      parts.push("### AI-Generated Answer\n");
      for (const block of aiOverview.text_blocks) {
        if (block.snippet) parts.push(block.snippet);
        if (block.list)    parts.push(block.list.map(i => `- ${i}`).join("\n"));
      }
      if (aiOverview.sources?.length) {
        parts.push("\n**Sources:**");
        parts.push(aiOverview.sources.map(s => `- [${s.title}](${s.link})`).join("\n"));
      }
    } else {
      parts.push("_No AI Overview available for this query._\n");
    }

    if (data.organic_results?.length) {
      parts.push("\n### 🔗 Top Web Results\n");
      parts.push(formatOrganicResults(data.organic_results.slice(0, 5)));
    }

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}

// ─── 3. Google Videos ─────────────────────────────────────────────────────────
export function registerGoogleVideos(server: McpServer): void {
  server.registerTool("google_videos_search", {
    title: "Google Videos Search",
    description: "Search Google Videos (YouTube, Vimeo, and other video platforms indexed by Google).",
    inputSchema: BaseSearchSchema,
    annotations: READ_ONLY,
  }, async ({ query, num, page, lang, country, response_format }) => {
    const params = buildSerpParams(query, {
      engine: ENGINES.GOOGLE,
      tbm: "vid",
      num,
      start: (page - 1) * num,
      hl: lang,
      gl: country,
    });

    const data = await serpApiRequest<GoogleSearchResponse>(params);
    const results = data.organic_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(results) }] };

    const text = results.length
      ? results.map(r => `**${r.position}. [${r.title}](${r.link})**\n${r.snippet ?? ""}`).join("\n\n")
      : "No video results found.";

    return { content: [{ type: "text", text: `## 🎬 Google Videos: "${query}"\n\n${text}` }] };
  });
}

// ─── 4. Google Finance ────────────────────────────────────────────────────────
export function registerGoogleFinance(server: McpServer): void {
  server.registerTool("google_finance_search", {
    title: "Google Finance Search",
    description: `Search Google Finance for stock prices, market data, and financial news.

Args:
  - query: Stock ticker or company name (e.g., 'AAPL', 'Tesla stock')
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      query:           z.string().min(1).describe("Stock ticker or company (e.g. 'GOOGL', 'Apple stock')"),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, response_format }) => {
    const params = buildSerpParams(query, { engine: ENGINES.GOOGLE_FINANCE });
    const data   = await serpApiRequest<Record<string, unknown>>(params);

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(data) }] };

    return { content: [{ type: "text", text: `## 📈 Google Finance: "${query}"\n\n${formatJson(data)}` }] };
  });
}

// ─── 5. Google Jobs ───────────────────────────────────────────────────────────
export function registerGoogleJobs(server: McpServer): void {
  server.registerTool("google_jobs_search", {
    title: "Google Jobs Search",
    description: `Search Google Jobs for job listings.

Args:
  - query: Job title and/or location (e.g., 'software engineer Cairo')
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      query:           z.string().min(1).describe("Job title + location (e.g. 'Python developer remote')"),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, response_format }) => {
    const params = buildSerpParams(query, { engine: ENGINES.GOOGLE_JOBS });
    const data   = await serpApiRequest<{ jobs_results?: unknown[] }>(params);
    const jobs   = data.jobs_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(jobs) }] };

    if (!jobs.length) return { content: [{ type: "text", text: `No job listings found for "${query}".` }] };

    const text = (jobs as Record<string, unknown>[]).map((j, i) => [
      `**${i + 1}. ${j["title"]}** — ${j["company_name"]}`,
      j["location"] ? `📍 ${j["location"]}` : "",
      j["description"] ? `> ${String(j["description"]).slice(0, 200)}…` : "",
    ].filter(Boolean).join("\n")).join("\n\n");

    return { content: [{ type: "text", text: `## 💼 Google Jobs: "${query}"\n\n${text}` }] };
  });
}

// ─── 6. Google Patents ────────────────────────────────────────────────────────
export function registerGooglePatents(server: McpServer): void {
  server.registerTool("google_patents_search", {
    title: "Google Patents Search",
    description: "Search Google Patents for patent documents and inventions.",
    inputSchema: z.object({
      query:           z.string().min(1).describe("Patent search query (e.g. 'machine learning image recognition')"),
      num:             z.number().int().min(1).max(20).default(10),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, num, response_format }) => {
    const params = buildSerpParams(query, { engine: ENGINES.GOOGLE_PATENTS, num });
    const data   = await serpApiRequest<{ organic_results?: Record<string, unknown>[] }>(params);
    const results = data.organic_results ?? [];

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(results) }] };

    const text = results.length
      ? results.map((r, i) => `**${i + 1}. [${r["title"]}](${r["patent_link"] ?? r["link"]})**\n${r["snippet"] ?? ""}` ).join("\n\n")
      : "No patents found.";

    return { content: [{ type: "text", text: `## 🔬 Google Patents: "${query}"\n\n${text}` }] };
  });
}
