import axios, { AxiosError } from "axios";
import { CHARACTER_LIMIT, SERPAPI_BASE_URL, DDG_BASE_URL } from "../constants.js";
import type { SerpApiParams, DdgInstantResponse } from "../types.js";

// ─── SerpAPI Client ───────────────────────────────────────────────────────────
export async function serpApiRequest<T>(params: SerpApiParams): Promise<T> {
  try {
    const response = await axios.get<T>(SERPAPI_BASE_URL, {
      params,
      timeout: 30_000,
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      const status  = error.response?.status;
      const message = (error.response?.data as Record<string, unknown>)?.error ?? error.message;

      if (status === 401) throw new Error("SerpAPI authentication failed. Check your SERPAPI_API_KEY.");
      if (status === 429) throw new Error("SerpAPI rate limit exceeded. Slow down or upgrade your plan.");
      if (status === 400) throw new Error(`SerpAPI bad request: ${message}`);
      throw new Error(`SerpAPI request failed (${status}): ${message}`);
    }
    throw error;
  }
}

// ─── DuckDuckGo Instant Answer API ───────────────────────────────────────────
export async function ddgInstantRequest(query: string): Promise<DdgInstantResponse> {
  try {
    const response = await axios.get<DdgInstantResponse>(DDG_BASE_URL, {
      params: { q: query, format: "json", no_html: 1, skip_disambig: 1, no_redirect: 1 },
      timeout: 15_000,
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });
    return response.data;
  } catch (error) {
    if (error instanceof AxiosError) {
      throw new Error(`DuckDuckGo request failed: ${error.message}`);
    }
    throw error;
  }
}

// ─── Response Helpers ─────────────────────────────────────────────────────────
export function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT) + `\n\n[... truncated — ${text.length - CHARACTER_LIMIT} chars omitted]`;
}

export function formatJson(data: unknown): string {
  return truncate(JSON.stringify(data, null, 2));
}
