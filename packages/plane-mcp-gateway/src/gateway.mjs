import {authorizePlaneRequest, isPlaneIdentityAllowed} from "./policy.mjs";

const jsonRpcError = (status, id, code, message, headers = {}) =>
  Response.json(
    {jsonrpc: "2.0", id: id ?? null, error: {code, message}},
    {status, headers: {"cache-control": "no-store", ...headers}},
  );

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, dpop, mcp-method, mcp-name, mcp-protocol-version, mcp-session-id",
  "access-control-expose-headers": "mcp-method, mcp-name, mcp-protocol-version, mcp-session-id, www-authenticate",
};

const MODERN_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_UPSTREAM_PROTOCOL_VERSION = "2025-11-25";
const MODERN_PROTOCOL_VERSION_META = "io.modelcontextprotocol/protocolVersion";

const protocolVersionFromBody = (body) => {
  const metadata = body?.params?._meta;
  return typeof metadata?.[MODERN_PROTOCOL_VERSION_META] === "string"
    ? metadata[MODERN_PROTOCOL_VERSION_META].trim()
    : "";
};

const protocolVersionForRequest = (request, body) =>
  request.headers.get("mcp-protocol-version")?.trim() || protocolVersionFromBody(body);

const isModernProtocolRequest = (request, body) =>
  protocolVersionForRequest(request, body) === MODERN_PROTOCOL_VERSION;

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

// Legacy MCP clients negotiate the protocol version in initialize.params and
// omit the HTTP header on that first request.  Forwarding a hard-coded header
// in that case can make the upstream session negotiate a different version
// from the one the client requested; the next tools/list request then fails
// even though OAuth succeeded.  Preserve an explicit header, otherwise use
// the initialize payload, and retain the pre-header version as the fallback
// for non-initialize requests from older clients.
const protocolVersionForUpstream = (request, body) => {
  const declaredHeader = request.headers.get("mcp-protocol-version")?.trim();
  if (declaredHeader) {
    // Plane MCP v0.3.x is a legacy server. Keep the modern client-facing
    // protocol at the gateway boundary, but downgrade the upstream header so
    // Plane accepts the request instead of returning Unsupported protocol.
    return declaredHeader === MODERN_PROTOCOL_VERSION
      ? LEGACY_UPSTREAM_PROTOCOL_VERSION
      : declaredHeader;
  }

  const declaredBody = body?.method === "initialize" && typeof body.params?.protocolVersion === "string"
    ? body.params.protocolVersion.trim()
    : protocolVersionFromBody(body);
  return declaredBody === MODERN_PROTOCOL_VERSION
    ? LEGACY_UPSTREAM_PROTOCOL_VERSION
    : declaredBody || "2025-06-18";
};

const modernDiscoveryResponse = (id, serverName, serverVersion) => Response.json({
  jsonrpc: "2.0",
  id: id ?? null,
  result: {
    resultType: "complete",
    supportedVersions: [MODERN_PROTOCOL_VERSION],
    capabilities: {tools: {}},
    _meta: {
      "io.modelcontextprotocol/serverInfo": {
        name: serverName,
        version: serverVersion,
      },
    },
  },
}, {headers: {"cache-control": "no-store", ...corsHeaders}});

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
    allowedEmailDomains,
    verifyRequest,
    fetch: fetchImpl = globalThis.fetch,
    maxBodyBytes = 1024 * 1024,
    serverName = "HASHPASS Plane MCP Gateway",
    serverVersion = "0.1.0",
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
      emailVerified: identity.emailVerified,
      allowedSubjects,
      allowedEmails,
      allowedEmailDomains,
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
      emailVerified: identity.emailVerified,
      allowedSubjects,
      allowedEmails,
      allowedEmailDomains,
    });
    if (!decision.allowed) {
      const challenge = decision.requiredScope
        ? {"www-authenticate": `Bearer resource_metadata="${metadataUrl}", error="insufficient_scope", scope="${decision.requiredScope}"`}
        : {};
      return jsonRpcError(403, body?.id, -32003, "Forbidden", {...challenge, ...corsHeaders});
    }

    // Modern MCP clients use server/discover before any legacy initialize
    // handshake. The deployed Plane MCP server is legacy-only, so answer this
    // capability probe at the gateway and bridge subsequent modern requests
    // to the legacy upstream below.
    if (body.method === "server/discover" && isModernProtocolRequest(request, body)) {
      return modernDiscoveryResponse(body.id, serverName, serverVersion);
    }

    try {
      const upstreamHeaders = new Headers({
        authorization: `Bearer ${serviceToken}`,
        "content-type": "application/json",
        "mcp-protocol-version": protocolVersionForUpstream(request, body),
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
