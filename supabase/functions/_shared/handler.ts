/**
 * Shared Edge Function handler
 * Wraps OPTIONS, method validation, CORS, try/catch, and JSON serialization
 */

import { corsHeaders } from "./cors.ts";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

/** Typed JSON response with CORS headers. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/** Logs response error message to console. */
export function errorResponse(message: string, status = 500, detail?: unknown): Response {
  if (detail) console.error(message, detail);
  else console.error(message);
  return jsonResponse({ error: message }, status);
}

/**
 * Require an env var or return a 500 Response.
 * Usage:
 *   const token = requireEnv("SLACK_BOT_TOKEN");
 *   if (token instanceof Response) return token;
 */
export function requireEnv(name: string): string | Response {
  const value = Deno.env.get(name);
  if (value) return value;
  return errorResponse(`${name} not configured`);
}

type HandlerFn = (req: Request) => Promise<Response>;

/**
 * Wrap an async handler with POST-only validation, CORS, and error catching.
 * Usage: `serve(async (req) => { ... return jsonResponse({ok: true}); })`
 */
export function serve(handler: HandlerFn): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(String(err), 500, err);
    }
  });
}
