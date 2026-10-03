import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authenticate } from "@/lib/mcp-tokens";
import { createMcpServer } from "@/lib/mcp-server";
import { HttpError } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * MCP over Streamable HTTP, stateless: every POST gets a fresh server and answers with one JSON response.
 * Auth is a personal access token in `Authorization: Bearer`, and ONLY that. This route never reads the
 * session cookie, which is why src/proxy.ts can let it past the cookie checks.
 */

/** Base64 attachments inflate ~33%, so this fits the 4 MB of files plus the JSON around them, and Vercel's own body cap is lower still. */
const MAX_BODY_BYTES = 4.4 * 1024 * 1024;

const unauthorized = (invalid: boolean) =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message: invalid ? "Invalid, revoked or expired token." : "Send your Sorta access token as 'Authorization: Bearer <token>'." }, id: null },
    {
      status: 401,
      headers: { "WWW-Authenticate": `Bearer realm="sorta"${invalid ? ', error="invalid_token"' : ""}`, "Cache-Control": "no-store" },
    },
  );

const rpcError = (status: number, code: number, message: string, headers?: HeadersInit) =>
  Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers });

/** Reads the body, refusing more than MAX_BODY_BYTES without buffering past it. */
async function readCapped(req: Request): Promise<string> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, "Request too large.");
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Request too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handle(req: Request): Promise<Response> {
  let auth;
  try {
    auth = await authenticate(req);
  } catch (err) {
    if (err instanceof HttpError) return rpcError(err.status, -32603, err.message);
    console.error("[mcp] auth failed", err);
    return rpcError(500, -32603, "Couldn't check the token.");
  }
  if (!auth) return unauthorized(req.headers.has("authorization"));

  // Stateless: there is no session to resume and no server-initiated stream, so only POST is served.
  if (req.method !== "POST") return rpcError(405, -32000, "Method not allowed. POST JSON-RPC messages to this endpoint.", { Allow: "POST" });

  let parsedBody: unknown;
  try {
    const text = await readCapped(req);
    parsedBody = text ? JSON.parse(text) : undefined;
  } catch (err) {
    if (err instanceof HttpError) return rpcError(err.status, -32600, err.message);
    return rpcError(400, -32700, "Parse error: the body must be JSON.");
  }

  const server = createMcpServer(auth.ctx, auth.scopes);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req, { parsedBody });
  } catch (err) {
    console.error("[mcp] request failed", err);
    return rpcError(500, -32603, "Internal error.");
  } finally {
    // Responses are plain JSON by now; free the per-request server.
    void server.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
