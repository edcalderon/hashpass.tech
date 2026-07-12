/**
 * AWS Lambda Handler for Expo Server API Routes
 * This handler uses Expo Server to handle all API routes
 */

const { createRequestHandler } = require("@expo/server/build/index");
const path = require("path");

// @sentry/aws-serverless is installed at Lambda packaging time (see
// packages/tools/scripts/package-lambda.sh's `npm install --production`
// step inside the copied package dir), not via the monorepo's pnpm
// install — this module isn't in the root node_modules, so tests that
// require() this file directly need this to fail soft rather than
// blowing up module load entirely.
let Sentry = null;
try {
  Sentry = require("@sentry/aws-serverless");
} catch {
  // absent outside a packaged Lambda deploy — every Sentry.* call below
  // is already gated on both `Sentry` and SENTRY_DSN being present.
}

// Route handlers (apps/mobile-app/app/api/**/+api.ts) generally catch their
// own errors and return a normal Response with a 4xx/5xx status instead of
// throwing — e.g. a Supabase client rejecting because of an invalid key
// never surfaces as an exception here, just a 500 response. A plain
// exception-only Sentry wrap would silently miss all of those. Sentry.init()
// is a no-op with an empty dsn.
//
// NODE_ENV only (not EXPO_PUBLIC_ENV) — this is server-only Lambda code, and
// referencing an EXPO_PUBLIC_* var here trips babel-preset-expo's client env
// inlining transform on this file when it's require()'d from Jest tests in
// apps/mobile-app, even though this file lives entirely outside that app.
if (Sentry && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.2,
  });
}

// Create Expo Server request handler
// The build directory should contain the compiled server code
const handleRequest = createRequestHandler(path.join(__dirname, "server"));

const DEFAULT_CORS_ALLOWED_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:19006",
  "http://127.0.0.1:8081",
  "https://hashpass.tech",
  "https://www.hashpass.tech",
  "https://dev.hashpass.tech",
  "https://bsl.hashpass.tech",
  "https://bsl-dev.hashpass.tech",
  "https://blockchainsummit.hashpass.lat",
  "https://blockchainsummit-dev.hashpass.lat",
];

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getHeader(headers, name) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function resolveCorsOrigin(event) {
  const origin = getHeader(event.headers, "origin");
  if (!origin) return "*";

  const allowedOrigins = new Set([
    ...DEFAULT_CORS_ALLOWED_ORIGINS,
    ...splitCsv(process.env.CORS_ALLOW_ORIGINS),
    ...splitCsv(process.env.API_CORS_ORIGINS),
    ...splitCsv(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
  ]);

  if (allowedOrigins.has("*") || allowedOrigins.has(origin)) {
    return origin;
  }

  return "*";
}

function applyCorsHeaders(headers, event) {
  const resolvedOrigin = resolveCorsOrigin(event);

  if (!headers["access-control-allow-origin"]) {
    headers["access-control-allow-origin"] = resolvedOrigin;
  }
  if (!headers["access-control-allow-methods"]) {
    headers["access-control-allow-methods"] =
      "GET, POST, PUT, DELETE, PATCH, OPTIONS";
  }
  if (!headers["access-control-allow-headers"]) {
    headers["access-control-allow-headers"] =
      "Content-Type, Authorization, Cache-Control, Pragma, Expires, X-Client-Version";
  }
  if (resolvedOrigin !== "*" && !headers["access-control-allow-credentials"]) {
    headers["access-control-allow-credentials"] = "true";
  }

  return headers;
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");
  if (!setCookie) return [];

  return setCookie
    .split(/,\s*(?=[^;,]+=)/)
    .map((cookie) => cookie.trim())
    .filter(Boolean);
}

function buildRequestHeaders(event) {
  const headers = new Headers(event.headers || {});
  const hasCookieHeader = Boolean(getHeader(event.headers, "cookie"));

  if (
    !hasCookieHeader &&
    Array.isArray(event.cookies) &&
    event.cookies.length > 0
  ) {
    headers.set("cookie", event.cookies.join("; "));
  }

  return headers;
}

// AWS Lambda handler for API Gateway
async function handleLambdaEvent(event) {
  try {
    // Support both API Gateway v1 (REST API) and v2 (HTTP API) events
    const method =
      event.httpMethod ||
      event.requestContext?.http?.method ||
      event.requestContext?.httpMethod ||
      "GET";

    // Handle OPTIONS preflight requests immediately with CORS headers
    if (method === "OPTIONS") {
      console.log("OPTIONS preflight request detected");
      return {
        statusCode: 204,
        headers: applyCorsHeaders(
          {
            "access-control-max-age": "86400",
          },
          event,
        ),
        body: "",
      };
    }

    // Extract path and query string from API Gateway event
    // API Gateway proxy integration includes stage in path, remove it
    let requestPath =
      event.path ||
      event.requestContext?.http?.path ||
      event.requestContext?.path ||
      "/";

    // Remove /prod or /{stage} prefix if present
    if (requestPath.startsWith("/prod/")) {
      requestPath = requestPath.replace("/prod", "");
    }

    const queryString =
      event.rawQueryString ||
      (event.queryStringParameters
        ? new URLSearchParams(event.queryStringParameters || {}).toString()
        : "");

    // Build full URL
    const domainName =
      event.requestContext?.domainName ||
      event.headers?.Host ||
      "api.hashpass.tech";
    const protocol = event.headers?.["X-Forwarded-Proto"] || "https";
    const fullUrl = `${protocol}://${domainName}${requestPath}${queryString ? `?${queryString}` : ""}`;

    console.log(
      "API Gateway Event:",
      JSON.stringify(
        {
          path: event.path,
          httpPath: event.requestContext?.http?.path,
          requestPath,
          method,
          queryString,
          fullUrl,
          version: event.version,
        },
        null,
        2,
      ),
    );

    // Convert API Gateway event to Request object
    const request = new Request(fullUrl, {
      method: method,
      headers: buildRequestHeaders(event),
      body:
        event.body && method !== "GET" && method !== "HEAD"
          ? typeof event.body === "string"
            ? event.body
            : JSON.stringify(event.body)
          : undefined,
    });

    // Handle the request with Expo Server
    const response = await handleRequest(request);

    // Route handlers catch their own errors and return a normal Response
    // with a 5xx status instead of throwing, so this is the only place that
    // sees them. Report explicitly — Sentry.wrapHandler() below only sees
    // exceptions that actually escape this function.
    if (response.status >= 500 && Sentry && process.env.SENTRY_DSN) {
      Sentry.captureMessage(`API route returned ${response.status}`, {
        level: "error",
        tags: { http_status: response.status, http_method: method },
        extra: { path: requestPath, fullUrl },
      });
    }

    // Convert Response to API Gateway format
    const body = await response.text();
    const headers = {};
    const headerKeys = new Set();
    const setCookieHeaders = getSetCookieHeaders(response.headers);

    // Collect headers (normalize to lowercase keys to avoid duplicates)
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // API Gateway doesn't support some headers, filter them out
      if (
        lowerKey !== "content-encoding" &&
        lowerKey !== "transfer-encoding" &&
        lowerKey !== "set-cookie"
      ) {
        // Use lowercase key to avoid duplicates
        if (!headerKeys.has(lowerKey)) {
          headers[lowerKey] = value;
          headerKeys.add(lowerKey);
        }
      }
    });

    // Ensure CORS headers are present and credentials-safe for Better Auth.
    applyCorsHeaders(headers, event);

    // Ensure body is a string (not an object)
    const responseBody = typeof body === "string" ? body : JSON.stringify(body);

    // Log response details for debugging
    console.log("Response details:", {
      status: response.status,
      bodyLength: responseBody.length,
      headersCount: Object.keys(headers).length,
      setCookieCount: setCookieHeaders.length,
      firstHeaders: Object.keys(headers).slice(0, 5),
    });

    const apiGatewayResponse = {
      statusCode: response.status,
      headers,
      body: responseBody,
      isBase64Encoded: false,
    };

    if (setCookieHeaders.length > 0) {
      if (event.version === "2.0") {
        apiGatewayResponse.cookies = setCookieHeaders;
      } else {
        apiGatewayResponse.multiValueHeaders = {
          "set-cookie": setCookieHeaders,
        };
      }
    }

    // Validate response format
    if (typeof apiGatewayResponse.statusCode !== "number") {
      throw new Error("statusCode must be a number");
    }
    if (typeof apiGatewayResponse.body !== "string") {
      throw new Error("body must be a string");
    }
    if (typeof apiGatewayResponse.headers !== "object") {
      throw new Error("headers must be an object");
    }

    return apiGatewayResponse;
  } catch (error) {
    console.error("Error handling API request:", error);
    console.error("Event:", JSON.stringify(event, null, 2));

    if (Sentry && process.env.SENTRY_DSN) {
      Sentry.captureException(error);
    }

    return {
      statusCode: 500,
      headers: applyCorsHeaders(
        {
          "Content-Type": "application/json",
        },
        event,
      ),
      body: JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      }),
      isBase64Encoded: false,
    };
  }
}

// Sentry.wrapHandler() ensures buffered events are flushed before the Lambda
// execution environment freezes on return — a plain try/catch around the
// handler body isn't enough for that, and it also catches exceptions that
// escape handleLambdaEvent entirely (e.g. thrown before the try block).
exports.handler = Sentry && process.env.SENTRY_DSN
  ? Sentry.wrapHandler(handleLambdaEvent)
  : handleLambdaEvent;

exports._internal = {
  buildRequestHeaders,
  applyCorsHeaders,
  resolveCorsOrigin,
};
