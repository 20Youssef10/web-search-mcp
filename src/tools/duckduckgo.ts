import { McpServer }    from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }            from "zod";
import { ENGINES }      from "../constants.js";
import { serpApiRequest, ddgInstantRequest, formatJson } from "../services/http.js";
import { BaseSearchSchema, ResponseFormatSchema } from "../schemas/common.js";
import type { DdgInstantResponse, DdgResult, DdgTopic } from "../types.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

// ─── DDG Topic Flattener ──────────────────────────────────────────────────────
function flattenTopics(topics: DdgTopic[]): DdgResult[] {
  const results: DdgResult[] = [];

  for (const topic of topics) {
    if (topic.Topics) {
      results.push(...flattenTopics(topic.Topics));
    } else if (topic.FirstURL && topic.Text) {
      results.push({
        title:   topic.Text.split(" - ")[0] ?? topic.Text,
        url:     topic.FirstURL,
        snippet: topic.Text,
      });
    }
  }
  return results;
}

// ─── 1. DuckDuckGo Instant Answer (native, no API key needed) ─────────────────
export function registerDdgInstant(server: McpServer): void {
  server.registerTool("duckduckgo_instant_answer", {
    title: "DuckDuckGo Instant Answer",
    description: `Query DuckDuckGo's Instant Answer API — no API key required.
Returns quick answers, definitions, Wikipedia summaries, related topics, and direct results.

Best for: factual lookups, definitions, entity info (people, places, organizations).
Note: This API returns curated instant answers, not a full web search results list.

Args:
  - query: Question or topic
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      query:           z.string().min(1).max(500).describe("Question or topic to look up"),
      response_format: ResponseFormatSchema,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, response_format }) => {
    const data: DdgInstantResponse = await ddgInstantRequest(query);

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(data) }] };

    const parts: string[] = [`## 🦆 DuckDuckGo: "${query}"\n`];

    if (data.Answer) {
      parts.push(`### ⚡ Instant Answer\n${data.Answer}\n`);
    }

    if (data.Abstract) {
      parts.push(`### 📖 Summary\n${data.Abstract}\n`);
      if (data.AbstractURL) parts.push(`🔗 Source: ${data.AbstractURL}\n`);
    }

    if (data.Definition) {
      parts.push(`### 📚 Definition\n${data.Definition}\n`);
      if (data.DefinitionURL) parts.push(`🔗 ${data.DefinitionURL}\n`);
    }

    const relatedResults = flattenTopics(data.RelatedTopics ?? []).slice(0, 8);
    if (relatedResults.length) {
      parts.push("### 🔗 Related Topics");
      parts.push(relatedResults.map(r => `- [${r.title}](${r.url}): ${r.snippet ?? ""}`).join("\n"));
    }

    const directResults = (data.Results ?? []).slice(0, 5);
    if (directResults.length) {
      parts.push("\n### 🔗 Direct Results");
      parts.push(directResults.map(r => `- [${r.Text}](${r.FirstURL})`).join("\n"));
    }

    if (parts.length === 1) {
      parts.push("_No instant answer available. Try `duckduckgo_search` for full web results._");
    }

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}

// ─── 2. DuckDuckGo Web Search (via SerpAPI) ───────────────────────────────────
export function registerDdgSearch(server: McpServer): void {
  server.registerTool("duckduckgo_search", {
    title: "DuckDuckGo Web Search",
    description: `Full DuckDuckGo web search with organic results via SerpAPI.
Provides privacy-focused search results from DuckDuckGo.
Requires SERPAPI_API_KEY.

Args:
  - query: Search query
  - num: Results count (1–30, default 10)
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      query:           z.string().min(1).max(500),
      num:             z.number().int().min(1).max(30).default(10),
      response_format: ResponseFormatSchema,
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, num, response_format }) => {
    const params = {
      api_key: process.env.SERPAPI_API_KEY!,
      engine:  ENGINES.DUCKDUCKGO,
      q: query,
    };

    const data    = await serpApiRequest<{ organic_results?: Record<string, unknown>[] }>(params);
    const results = (data.organic_results ?? []).slice(0, num);

    if (response_format === "json") return { content: [{ type: "text", text: formatJson(results) }] };

    const text = results.length
      ? results.map((r, i) => [
          `**${i + 1}. [${r["title"]}](${r["link"]})**`,
          r["snippet"] ? `> ${r["snippet"]}` : "",
        ].filter(Boolean).join("\n")).join("\n\n")
      : "No results found.";

    return { content: [{ type: "text", text: `## 🦆 DuckDuckGo: "${query}"\n\n${text}` }] };
  });
}
