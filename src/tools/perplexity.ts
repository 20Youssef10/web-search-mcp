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

// ─── Current Perplexity Sonar models (updated 2025) ───────────────────────────
const SONAR_MODELS = [
  "sonar",                 // fast + cheap, real-time web search
  "sonar-pro",             // deeper search, more citations
  "sonar-reasoning",       // thinks step-by-step before answering
  "sonar-reasoning-pro",   // best accuracy, slowest
  "sonar-deep-research",   // autonomous multi-step research
] as const;

type SonarModel = (typeof SONAR_MODELS)[number];

// ─── Types ────────────────────────────────────────────────────────────────────
interface SonarMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

interface SonarChoice {
  message:       { role: string; content: string };
  finish_reason: string;
}

interface SonarResponse {
  id:        string;
  model:     string;
  choices:   SonarChoice[];
  usage:     { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  citations?: string[];
}

// ─── Error message extractor ──────────────────────────────────────────────────
// Perplexity returns { error: { message: "...", type: "...", code: ... } }
function extractErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return String(data);
  const d = data as Record<string, unknown>;

  // { error: { message: "..." } }
  if (d["error"] && typeof d["error"] === "object") {
    const e = d["error"] as Record<string, unknown>;
    if (typeof e["message"] === "string") return e["message"];
    return JSON.stringify(e);
  }
  // { error: "string" }
  if (typeof d["error"] === "string") return d["error"];
  // { message: "string" }
  if (typeof d["message"] === "string") return d["message"];

  return JSON.stringify(d);
}

// ─── API Key helper ───────────────────────────────────────────────────────────
function getApiKey(): string {
  const raw = process.env.PERPLEXITY_API_KEY ?? "";
  // Strip accidental quotes or whitespace that can happen in Vercel UI
  const key = raw.trim().replace(/^["']|["']$/g, "");
  if (!key) {
    throw new Error(
      "PERPLEXITY_API_KEY is not set. " +
      "Add it in Vercel → Project → Settings → Environment Variables, then redeploy."
    );
  }
  return key;
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────
async function sonarRequest(
  messages:    SonarMessage[],
  model:       SonarModel,
  extraParams: Record<string, unknown> = {}
): Promise<SonarResponse> {
  const apiKey = getApiKey();

  try {
    const response = await axios.post<SonarResponse>(
      "https://api.perplexity.ai/chat/completions",
      { model, messages, ...extraParams },
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type":  "application/json",
          "Accept":        "application/json",
        },
        timeout: 90_000,
      }
    );
    return response.data;

  } catch (err) {
    if (err instanceof AxiosError) {
      const status  = err.response?.status;
      const rawData = err.response?.data;
      const message = extractErrorMessage(rawData);

      if (status === 401) {
        throw new Error(
          `Perplexity authentication failed (401). ` +
          `Your key starts with: "${apiKey.slice(0, 8)}...". ` +
          `Verify it at https://www.perplexity.ai/settings/api. ` +
          `API detail: ${message}`
        );
      }
      if (status === 400) throw new Error(`Perplexity bad request (400): ${message}`);
      if (status === 429) throw new Error("Perplexity rate limit exceeded (429). Wait and retry.");
      if (status === 422) throw new Error(`Perplexity validation error (422): ${message}`);
      if (status === 503) throw new Error("Perplexity service unavailable (503). Try again later.");

      throw new Error(
        `Perplexity API error (HTTP ${status ?? "no response"}): ${message}. ` +
        `Raw: ${JSON.stringify(rawData)}`
      );
    }
    // Network / timeout errors
    if (err instanceof Error) {
      throw new Error(`Perplexity network error: ${err.message}`);
    }
    throw err;
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function truncate(text: string): string {
  return text.length <= CHARACTER_LIMIT
    ? text
    : text.slice(0, CHARACTER_LIMIT) + "\n\n[... truncated]";
}

function formatCitations(citations: string[]): string {
  return citations.map((url, i) => `[${i + 1}] ${url}`).join("\n");
}

function injectCitationLinks(text: string, citations: string[]): string {
  return text.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num, 10) - 1;
    return citations[idx] ? `[[${num}]](${citations[idx]})` : match;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. perplexity_search
// ─────────────────────────────────────────────────────────────────────────────
export function registerPerplexitySearch(server: McpServer): void {
  server.registerTool("perplexity_search", {
    title: "Perplexity AI Search",
    description: `Search the web using Perplexity's Sonar API and get an AI-generated answer with cited sources.

Unlike traditional search that returns links, Perplexity reads the web in real time
and returns a synthesized answer with numbered citations.

Args:
  - query: Your question or search query
  - model: sonar (fast/default) | sonar-pro (deep) | sonar-reasoning (step-by-step) | sonar-reasoning-pro (best)
  - system_prompt: Optional instructions, e.g. "Answer in Arabic" or "Be concise"
  - search_recency: Filter sources — 'month', 'week', 'day', 'hour'
  - response_format: 'markdown' or 'json'

Returns: AI-generated answer + numbered citations with source URLs.`,
    inputSchema: z.object({
      query:           z.string().min(1).max(1000),
      model:           z.enum(SONAR_MODELS).default("sonar"),
      system_prompt:   z.string().max(500).optional().describe("e.g. 'Answer in Arabic', 'Be concise'"),
      search_recency:  z.enum(["month","week","day","hour"]).optional(),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ query, model, system_prompt, search_recency, response_format }) => {
    const messages: SonarMessage[] = [];
    if (system_prompt) messages.push({ role: "system", content: system_prompt });
    messages.push({ role: "user", content: query });

    const extra: Record<string, unknown> = {};
    if (search_recency) extra["search_recency_filter"] = search_recency;

    const data      = await sonarRequest(messages, model, extra);
    const answer    = data.choices[0]?.message?.content ?? "";
    const citations = data.citations ?? [];

    if (response_format === "json") {
      return { content: [{ type: "text", text: JSON.stringify(
        { answer, citations, model: data.model, usage: data.usage }, null, 2
      ) }] };
    }

    const body = citations.length ? injectCitationLinks(answer, citations) : answer;
    const parts = [
      `## 🔮 Perplexity: "${query}"`,
      `> _Model: ${data.model}_\n`,
      truncate(body),
    ];
    if (citations.length) parts.push(`\n### 📚 Sources\n${formatCitations(citations)}`);

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. perplexity_deep_research
// ─────────────────────────────────────────────────────────────────────────────
export function registerPerplexityDeepResearch(server: McpServer): void {
  server.registerTool("perplexity_deep_research", {
    title: "Perplexity Deep Research",
    description: `Conduct in-depth research using Perplexity's sonar-reasoning-pro model.
Produces a comprehensive, structured report with full citations.

Args:
  - topic: Research topic or question
  - focus: Optional angle, e.g. "Focus on recent developments" or "Compare pros and cons"
  - language: Response language (default: English)
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      topic:           z.string().min(1).max(500),
      focus:           z.string().max(200).optional(),
      language:        z.string().default("English"),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ topic, focus, language, response_format }) => {
    const messages: SonarMessage[] = [
      {
        role: "system",
        content: `You are a research assistant. Provide a comprehensive, well-structured research report. ` +
                 `Always respond in ${language}. Use headings and bullet points. ` +
                 `Cite every factual claim with [1], [2], etc.`,
      },
      {
        role: "user",
        content: focus ? `Research: ${topic}\n\nFocus: ${focus}` : `Research: ${topic}`,
      },
    ];

    const data      = await sonarRequest(messages, "sonar-reasoning-pro");
    const answer    = data.choices[0]?.message?.content ?? "";
    const citations = data.citations ?? [];

    if (response_format === "json") {
      return { content: [{ type: "text", text: JSON.stringify(
        { report: answer, citations, usage: data.usage }, null, 2
      ) }] };
    }

    const body  = citations.length ? injectCitationLinks(answer, citations) : answer;
    const parts = [
      `## 🔬 Deep Research: "${topic}"`,
      focus ? `> _Focus: ${focus}_\n` : "",
      truncate(body),
    ].filter(Boolean);
    if (citations.length) parts.push(`\n### 📚 Sources (${citations.length})\n${formatCitations(citations)}`);

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. perplexity_news
// ─────────────────────────────────────────────────────────────────────────────
export function registerPerplexityNews(server: McpServer): void {
  server.registerTool("perplexity_news", {
    title: "Perplexity Latest News",
    description: `Get the latest news on any topic using Perplexity's real-time web search.

Args:
  - topic: News topic (e.g. "AI developments", "Bitcoin price")
  - recency: 'hour' | 'day' (default) | 'week'
  - language: Response language (default: English)
  - response_format: 'markdown' or 'json'`,
    inputSchema: z.object({
      topic:           z.string().min(1).max(500),
      recency:         z.enum(["hour","day","week"]).default("day"),
      language:        z.string().default("English"),
      response_format: z.enum(["json","markdown"]).default("markdown"),
    }).strict(),
    annotations: READ_ONLY,
  }, async ({ topic, recency, language, response_format }) => {
    const messages: SonarMessage[] = [
      {
        role: "system",
        content: `You are a news assistant. Summarize the latest news concisely. ` +
                 `Respond in ${language}. List key developments as bullet points with citations.`,
      },
      { role: "user", content: `Latest news about: ${topic}` },
    ];

    const data      = await sonarRequest(messages, "sonar-pro", { search_recency_filter: recency });
    const answer    = data.choices[0]?.message?.content ?? "";
    const citations = data.citations ?? [];

    if (response_format === "json") {
      return { content: [{ type: "text", text: JSON.stringify(
        { summary: answer, citations, recency }, null, 2
      ) }] };
    }

    const labels: Record<string, string> = { hour: "Last Hour", day: "Last 24h", week: "Last Week" };
    const body  = citations.length ? injectCitationLinks(answer, citations) : answer;
    const parts = [
      `## 📰 Latest News: "${topic}" — ${labels[recency]}`,
      "",
      truncate(body),
    ];
    if (citations.length) parts.push(`\n### 🔗 Sources\n${formatCitations(citations)}`);

    return { content: [{ type: "text", text: parts.join("\n") }] };
  });
}
