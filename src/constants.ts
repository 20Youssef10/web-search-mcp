// ─── API Constants ────────────────────────────────────────────────────────────
export const SERPAPI_BASE_URL = "https://serpapi.com/search";
export const DDG_BASE_URL     = "https://api.duckduckgo.com/";
export const DDG_HTML_URL     = "https://html.duckduckgo.com/html/";

// ─── Response Limits ──────────────────────────────────────────────────────────
export const DEFAULT_NUM_RESULTS = 10;
export const MAX_NUM_RESULTS     = 100;
export const CHARACTER_LIMIT     = 50_000;

// ─── SerpAPI Engine Names ─────────────────────────────────────────────────────
export const ENGINES = {
  GOOGLE:         "google",
  GOOGLE_IMAGES:  "google_images",
  GOOGLE_NEWS:    "google_news",
  GOOGLE_SCHOLAR: "google_scholar",
  GOOGLE_MAPS:    "google_maps",
  GOOGLE_JOBS:    "google_jobs",
  GOOGLE_FINANCE: "google_finance",
  GOOGLE_VIDEOS:  "google_videos",
  GOOGLE_PATENTS: "google_patents",
  BING:           "bing",
  BING_IMAGES:    "bing_images",
  BING_NEWS:      "bing_news",
  BING_VIDEOS:    "bing_videos",
  DUCKDUCKGO:     "duckduckgo",
  YAHOO:          "yahoo",
  YANDEX:         "yandex",
  BAIDU:          "baidu",
} as const;

export type Engine = typeof ENGINES[keyof typeof ENGINES];
