import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Authenticate requests using MCP_API_KEY env variable.
 * Clients must send:   Authorization: Bearer <key>
 *                 OR   x-api-key: <key>
 *
 * If MCP_API_KEY is not set, the endpoint is open (development mode).
 */
export function authenticate(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const expected = process.env.MCP_API_KEY;

  // No key configured → open access (warn in logs)
  if (!expected) {
    console.warn("[auth] MCP_API_KEY not set — endpoint is unprotected!");
    return true;
  }

  const authHeader  = req.headers["authorization"] ?? "";
  const xApiKey     = req.headers["x-api-key"] ?? "";

  const bearerToken = typeof authHeader === "string"
    ? authHeader.replace(/^Bearer\s+/i, "").trim()
    : "";

  const provided = bearerToken || (typeof xApiKey === "string" ? xApiKey.trim() : "");

  if (!provided) {
    sendUnauthorized(res, "Missing API key. Send 'Authorization: Bearer <key>' or 'x-api-key: <key>'.");
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
