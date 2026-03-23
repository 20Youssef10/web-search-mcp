import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

/**
 * Authenticate requests using MCP_API_KEY env variable.
 *
 * Accepted methods (in priority order):
 *   1. URL query param:  ?key=<key>          ← works with Claude.ai connector
 *   2. Authorization:    Bearer <key>         ← works with mcp-remote / curl
 *   3. Header:           x-api-key: <key>     ← works with programmatic clients
 *
 * If MCP_API_KEY is not set, the endpoint is open (development mode).
 */
export function authenticate(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const expected = process.env.MCP_API_KEY;

  // No key configured → open access
  if (!expected) {
    console.warn("[auth] MCP_API_KEY not set — endpoint is unprotected!");
    return true;
  }

  // ── 1. Query parameter: ?key=<value> ──────────────────────────────────────
  const baseUrl   = `http://localhost${req.url ?? "/"}`;
  const parsedUrl = new URL(baseUrl);
  const queryKey  = parsedUrl.searchParams.get("key")?.trim() ?? "";

  // ── 2. Authorization header: Bearer <value> ───────────────────────────────
  const authHeader  = req.headers["authorization"] ?? "";
  const bearerToken = typeof authHeader === "string"
    ? authHeader.replace(/^Bearer\s+/i, "").trim()
    : "";

  // ── 3. x-api-key header ───────────────────────────────────────────────────
  const xApiKey = req.headers["x-api-key"] ?? "";
  const headerKey = typeof xApiKey === "string" ? xApiKey.trim() : "";

  const provided = queryKey || bearerToken || headerKey;

  if (!provided) {
    sendUnauthorized(res,
      "Missing API key. Options:\n" +
      "  • URL param:  ?key=<key>\n" +
      "  • Header:     Authorization: Bearer <key>\n" +
      "  • Header:     x-api-key: <key>"
    );
    return false;
  }

  if (provided !== expected) {
    sendUnauthorized(res, "Invalid API key.");
    return false;
  }

  return true;
}

function sendUnauthorized(res: ServerResponse, message: string): void {
  res.writeHead(401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Unauthorized", message }));
}
