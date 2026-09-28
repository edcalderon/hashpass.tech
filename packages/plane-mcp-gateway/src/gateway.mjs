import {authorizePlaneRequest, isPlaneIdentityAllowed} from "./policy.mjs";

const jsonRpcError = (status, id, code, message, headers = {}) =>
  Response.json(
    {jsonrpc: "2.0", id: id ?? null, error: {code, message}},
    {status, headers: {"cache-control": "no-store", ...headers}},
  );

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, dpop, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "mcp-session-id, www-authenticate",
};

const normalizedList = (values) =>
  Array.isArray(values) ? values.map((value) => String(value).trim()).filter(Boolean) : [];

const copyResponse = (response) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders)) headers.set(name, value);
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
};

const requestDeclaresOversizedBody = (request, maxBodyBytes) => {
  const value = request.headers.get("content-length");
  return /^\d+$/.test(value ?? "") && Number(value) > maxBodyBytes;
};

const readBodyWithLimit = async (request, maxBodyBytes) => {
  if (!request.body) return {body: "", tooLarge: false};

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBodyBytes) {
      await reader.cancel("body_limit_exceeded");
      return {body: "", tooLarge: true};
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {body: new TextDecoder().decode(bytes), tooLarge: false};
};

export function createGatewayHandler(options) {
  const {
    resource,
    authorizationServers,
    scopesSupported,
    upstreamUrl,
    serviceToken,
    workspaceSlug,
    allowedSubjects,
    allowedEmails,
    verifyRequest,
    fetch: fetchImpl = globalThis.fetch,
    maxBodyBytes = 1024 * 1024,
  } = options ?? {};

  if (!resource || !upstreamUrl || !serviceToken || !workspaceSlug || typeof verifyRequest !== "function") {
    throw new Error("Incomplete Plane MCP gateway configuration");
  }

  const resourceUrl = new URL(resource);
  const resourceMetadataPath = `/.well-known/oauth-protected-resource${resourceUrl.pathname}`;
  const metadataUrl = new URL(resourceMetadataPath, resourceUrl).toString();
  const metadataPaths = new Set(["/.well-known/oauth-protected-resource", resourceMetadataPath]);
  const authServers = normalizedList(authorizationServers);
  const supportedScopes = normalizedList(scopesSupported);

  return async function handle(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return new Response("live\n", {headers: {"content-type": "text/plain", "cache-control": "no-store"}});
    }

    if (request.method === "GET" && metadataPaths.has(url.pathname)) {
      return Response.json({
        resource,
        authorization_servers: authServers,
        scopes_supported: supportedScopes,
      }, {headers: {"cache-control": "public, max-age=300", ...corsHeaders}});
    }

    if (url.pathname !== resourceUrl.pathname) return new Response("Not Found", {status: 404});
    if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: corsHeaders});
    if (request.method !== "POST") return new Response("Method Not Allowed", {status: 405, headers: {allow: "POST, OPTIONS"}});
    if (requestDeclaresOversizedBody(request, maxBodyBytes)) {
      return jsonRpcError(413, null, -32600, "MCP request is too large", corsHeaders);
    }

    let identity;
    try {
      identity = await verifyRequest(request);
    } catch {
      identity = null;
    }
    if (!identity) {
      return jsonRpcError(401, null, -32001, "Authentication required", {
        "www-authenticate": `Bearer resource_metadata="${metadataUrl}"`,
        ...corsHeaders,
      });
    }

    if (!isPlaneIdentityAllowed({
      subject: identity.subject,
      email: identity.email,
      allowedSubjects,
      allowedEmails,
    })) {
      return jsonRpcError(403, null, -32003, "Forbidden", corsHeaders);
    }

    const {body: rawBody, tooLarge} = await readBodyWithLimit(request, maxBodyBytes);
    if (tooLarge) {
      return jsonRpcError(413, null, -32600, "MCP request is too large", corsHeaders);
    }

    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonRpcError(400, null, -32700, "Invalid JSON", corsHeaders);
    }

    const decision = authorizePlaneRequest({
      body,
      scopes: identity.scopes,
      subject: identity.subject,
      email: identity.email,
      allowedSubjects,
      allowedEmails,
    });
    if (!decision.allowed) {
      const challenge = decision.requiredScope
        ? {"www-authenticate": `Bearer resource_metadata="${metadataUrl}", error="insufficient_scope", scope="${decision.requiredScope}"`}
        : {};
      return jsonRpcError(403, body?.id, -32003, "Forbidden", {...challenge, ...corsHeaders});
    }

    try {
      const upstreamHeaders = new Headers({
        authorization: `Bearer ${serviceToken}`,
        "content-type": "application/json",
        "mcp-protocol-version": request.headers.get("mcp-protocol-version") || "2025-06-18",
        "x-workspace-slug": workspaceSlug,
      });
      for (const headerName of ["accept", "mcp-session-id"]) {
        const value = request.headers.get(headerName);
        if (value) upstreamHeaders.set(headerName, value);
      }
      const upstreamResponse = await fetchImpl(upstreamUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: rawBody,
        redirect: "error",
      });
      return copyResponse(upstreamResponse);
    } catch {
      return jsonRpcError(502, body?.id, -32002, "Plane MCP upstream unavailable", corsHeaders);
    }
  };
}
