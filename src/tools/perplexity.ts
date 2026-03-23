import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z }         from "zod";
import axios, { AxiosError } from "axios";
import { CHARACTER_LIMIT }   from "../constants.js";

const READ_ONLY = {
  readOnlyHint:   true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint:  true,
};

// ─── Perplexity Models ────────────────────────────────────────────────────────
// sonar        → fast, cheap, real-time web search
// sonar-pro    → deeper search, more citations, better answers
// sonar-reasoning      → thinks before answering (slower, best accuracy)
// sonar-reasoning-pro  → pro-level reasoning + web search
const SONAR_MODELS = [
  "sonar",
  "sonar-pro",
  "sonar-reasoning",
  "sonar-reasoning-pro",
] as const;

type SonarModel = (typeof SONAR_MODELS)[number];

// ─── Types ────────────────────────────────────────────────────────────────────
interface SonarMessage {
  role:    "system" | "user" | "assistant";
  content: string;
}

interface SonarChoice {
  message: { role: string; content: string };
  finish_reason: string;
}

interface SonarResponse {
  id:      string;
  model:   string;
  choices: SonarChoice[];
  usage:   { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  citations?: string[];
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────
async function sonarRequest(
  messages: SonarMessage[],
  model: SonarModel,
  extraParams: Record<string, unknown> = {}
): Promise<SonarResponse> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "PERPLEXITY_API_KEY is not set. Get a key at https://www.perplexity.ai/settings/api"
    );
  }

  try {
    const response = await axios.post<SonarResponse>(
      "https://api.perplexity.ai/chat/completions",
      { model, messages, ...extraParams },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 60_000,
      }
    );
    return response.data;
  } catch (err) {
    if (err instanceof AxiosError) {
      const status  = err.response?.status;
      const message = (err.response?.data as Record<string, unknown>)?.error ?? err.message;
      if (status === 401) throw new Error("Perplexity auth failed. Check your PERPLEXITY_API_KEY.");
      if (status === 429) throw new Error("Perplexity rate limit exceeded.");
      throw new Error(`Perplexity API error (${status}): ${message}`);
    }
    throw err;
  }
}

// ─── Format citations ─────────────────────────────────────────────────────────
function formatCitations(citations: string[]): string {
  return citations
    .map((url, i) => `[${i + 1}] ${url}`)
    .join("\n");
}

function injectCitationLinks(text: string, citations: string[]): string {
  // Replace [1], [2] markers in text with markdown links
  return text.replace(/\[(\d+)\]/g, (match, num) => {
    const idx = parseInt(num) - 1;
    if (citations[idx]) return `[[${num}]](${citations[idx]})`;
    return match;
  });
}

// ─── Truncate helper ──────────────────────────────────────────────────────────
function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + `\n\n[... truncated]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. perplexity_search — Quick web-grounded answer with citations
// ─────────────────────────────────────────────────────────────────────────────
export function registerPerplexitySearch(server: McpServer): void {
  server.registerTool(
    "perplexity_search",
    {
      title: "Perplexity AI Search",
      description: `Search the web using Perplexity's Sonar API and get an AI-generated answer with cited sources.

Unlike traditional search engines that return a list of links, Perplexity reads the web in real time
and returns a synthesized, accurate answer with numbered citations.

Best for:
  - Questions that need a direct answer (not just links)
  - Research and fact-checking
  - Summarizing current events

Args:
  - query: Your question or search query
  - model: Sonar model to use
      • sonar        → fast, cheap (default)
      • sonar-pro    → deeper research, more citations
      • sonar-reasoning     → thinks step-by-step before answering
      • sonar-reasoning-pro → best accuracy, slowest
  - system_prompt: Optional instructions for how to answer (e.g. "Answer in Arabic")
  - search_recency: Filter sources by recency — 'month', 'week', 'day', 'hour'
  - response_format: 'markdown' or 'json'

Returns: AI-generated answer + numbered citations with source URLs.`,
      inputSchema: z.object({
        query: z.string().min(1).max(1000).describe("Question or search query"),
        model: z.enum(SONAR_MODELS).default("sonar").describe(
          "sonar (fast) | sonar-pro (deep) | sonar-reasoning (step-by-step) | sonar-reasoning-pro (best)"
        ),
        system_prompt: z
          .string()
          .max(500)
          .optional()
          .describe("Optional: custom instructions, e.g. 'Answer in Arabic' or 'Be concise'"),
        search_recency: z
          .enum(["month", "week", "day", "hour"])
          .optional()
          .describe("Filter web sources by recency"),
        response_format: z.enum(["json", "markdown"]).default("markdown"),
      }).strict(),
      annotations: READ_ONLY,
    },
    async ({ query, model, system_prompt, search_recency, response_format }) => {
      const messages: SonarMessage[] = [];

      if (system_prompt) {
        messages.push({ role: "system", content: system_prompt });
      }
      messages.push({ role: "user", content: query });

      const extraParams: Record<string, unknown> = {};
      if (search_recency) extraParams["search_recency_filter"] = search_recency;

      const data = await sonarRequest(messages, model, extraParams);

      const answer    = data.choices[0]?.message?.content ?? "";
      const citations = data.citations ?? [];

      if (response_format === "json") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ answer, citations, model: data.model, usage: data.usage }, null, 2),
          }],
        };
      }

      const answerWithLinks = citations.length
        ? injectCitationLinks(answer, citations)
        : answer;

      const parts = [
        `## 🔮 Perplexity: "${query}"`,
        `> _Model: ${data.model}_\n`,
        truncate(answerWithLinks),
      ];

      if (citations.length) {
        parts.push(`\n### 📚 Sources\n${formatCitations(citations)}`);
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. perplexity_deep_research — Multi-turn deep research on a topic
// ─────────────────────────────────────────────────────────────────────────────
export function registerPerplexityDeepResearch(server: McpServer): void {
  server.registerTool(
    "perplexity_deep_research",
    {
      title: "Perplexity Deep Research",
      description: `Conduct in-depth research on a topic using Perplexity's sonar-reasoning-pro model.

Uses chain-of-thought reasoning combined with real-time web search to produce a comprehensive,
well-structured research report on any topic with full citations.

Best for:
  - Academic or professional research
  - Detailed comparisons (products, technologies, concepts)
  - Understanding complex topics from multiple angles

Args:
  - topic: The research topic or question
  - focus: Optional specific angle (e.g. "Focus on recent developments since 2023")
  - language: Language for the response (default: English)
  - response_format: 'markdown' or 'json'

Returns: Detailed research report with structured sections and numbered citations.`,
      inputSchema: z.object({
        topic: z.string().min(1).max(500).describe("Research topic or question"),
        focus: z.string().max(200).optional().describe(
          "Optional focus angle, e.g. 'Compare pros and cons' or 'Focus on Arabic markets'"
        ),
        language: z.string().default("English").describe(
          "Response language (e.g. 'Arabic', 'English', 'French')"
        ),
        response_format: z.enum(["json", "markdown"]).default("markdown"),
      }).strict(),
      annotations: READ_ONLY,
    },
    async ({ topic, focus, language, response_format }) => {
      const systemPrompt = [
        `You are a research assistant. Provide a comprehensive, well-structured research report.`,
        `Always respond in ${language}.`,
        `Use headings, bullet points, and numbered citations.`,
        `Cite every factual claim with a numbered source reference like [1], [2], etc.`,
      ].join(" ");

      const userQuery = focus
        ? `Research topic: ${topic}\n\nSpecific focus: ${focus}`
        : `Research topic: ${topic}`;

      const messages: SonarMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userQuery },
      ];

      const data = await sonarRequest(messages, "sonar-reasoning-pro");

      const answer    = data.choices[0]?.message?.content ?? "";
      const citations = data.citations ?? [];

      if (response_format === "json") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ report: answer, citations, usage: data.usage }, null, 2),
          }],
        };
      }

      const reportWithLinks = citations.length
        ? injectCitationLinks(answer, citations)
        : answer;

      const parts = [
        `## 🔬 Deep Research: "${topic}"`,
        focus ? `> _Focus: ${focus}_\n` : "",
        truncate(reportWithLinks),
      ].filter(Boolean);

      if (citations.length) {
        parts.push(`\n### 📚 Sources (${citations.length})\n${formatCitations(citations)}`);
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. perplexity_news — Latest news on any topic with real-time sources
// ─────────────────────────────────────────────────────────────────────────────
export function registerPerplexityNews(server: McpServer): void {
  server.registerTool(
    "perplexity_news",
    {
      title: "Perplexity Latest News",
      description: `Get the latest news and developments on any topic using Perplexity's real-time web search.
Searches and summarizes the most recent news with source citations.

Args:
  - topic: News topic (e.g. "AI developments", "Gaza ceasefire", "Bitcoin price")
  - recency: How recent — 'hour', 'day', 'week' (default: 'day')
  - language: Language for summary (default: 'English')
  - response_format: 'markdown' or 'json'`,
      inputSchema: z.object({
        topic:           z.string().min(1).max(500).describe("News topic"),
        recency:         z.enum(["hour", "day", "week"]).default("day"),
        language:        z.string().default("English"),
        response_format: z.enum(["json", "markdown"]).default("markdown"),
      }).strict(),
      annotations: READ_ONLY,
    },
    async ({ topic, recency, language, response_format }) => {
      const messages: SonarMessage[] = [
        {
          role: "system",
          content: `You are a news assistant. Summarize the latest news on the given topic.
Respond in ${language}. Be concise. List key developments as bullet points with citations.`,
        },
        {
          role: "user",
          content: `What are the latest news and developments about: ${topic}`,
        },
      ];

      const data = await sonarRequest(messages, "sonar-pro", {
        search_recency_filter: recency,
      });

      const answer    = data.choices[0]?.message?.content ?? "";
      const citations = data.citations ?? [];

      if (response_format === "json") {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ summary: answer, citations, recency }, null, 2),
          }],
        };
      }

      const recencyLabel: Record<string, string> = {
        hour: "Last Hour", day: "Last 24 Hours", week: "Last Week",
      };

      const answerWithLinks = citations.length
        ? injectCitationLinks(answer, citations)
        : answer;

      const parts = [
        `## 📰 Latest News: "${topic}"`,
        `> _${recencyLabel[recency]}_\n`,
        truncate(answerWithLinks),
      ];

      if (citations.length) {
        parts.push(`\n### 🔗 Sources\n${formatCitations(citations)}`);
      }

      return { content: [{ type: "text", text: parts.join("\n") }] };
    }
  );
}
