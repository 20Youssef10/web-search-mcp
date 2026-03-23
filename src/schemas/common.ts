import { z } from "zod";
import { DEFAULT_NUM_RESULTS, MAX_NUM_RESULTS } from "../constants.js";

export const ResponseFormatSchema = z
  .enum(["json", "markdown"])
  .default("markdown")
  .describe("Output format: 'markdown' for readable text, 'json' for structured data");

export const NumResultsSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_NUM_RESULTS)
  .default(DEFAULT_NUM_RESULTS)
  .describe(`Number of results to return (1–${MAX_NUM_RESULTS}, default ${DEFAULT_NUM_RESULTS})`);

export const PageSchema = z
  .number()
  .int()
  .min(1)
  .default(1)
  .describe("Page number for pagination (starts at 1)");

export const LangSchema = z
  .string()
  .length(2)
  .default("en")
  .describe("Language code: 'en', 'ar', 'fr', 'de', etc.");

export const CountrySchema = z
  .string()
  .length(2)
  .default("us")
  .describe("Country code: 'us', 'eg', 'gb', etc.");

export const SafeSearchSchema = z
  .enum(["active", "moderate", "off"])
  .default("moderate")
  .describe("Safe search filter level");

// ─── Base query schema shared by many tools ───────────────────────────────────
export const BaseSearchSchema = z.object({
  query:           z.string().min(1).max(500).describe("Search query string"),
  num:             NumResultsSchema,
  page:            PageSchema,
  lang:            LangSchema,
  country:         CountrySchema,
  response_format: ResponseFormatSchema,
}).strict();
