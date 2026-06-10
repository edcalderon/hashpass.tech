/**
 * Cloudflare Worker for HashPass
 * Handles static file serving, API routes, SPA routing, and Cloudflare Access JWT validation
 * 
 * IMPORTANT: API routes in Metro format cannot be executed directly in Workers.
 * For API routes, you have two options:
 * 1. Use Cloudflare Pages Functions (FREE) - recommended
 * 2. Proxy API requests to an external backend
 */

import { jwtVerify, createRemoteJWKSet } from 'jose';

interface Env {
  POLICY_AUD?: string;
  TEAM_DOMAIN?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  API_BACKEND_URL?: string; // Optional: URL to proxy API requests
  [key: string]: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cf-Access-Jwt-Assertion',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Validate Cloudflare Access JWT if Access is configured
    if (env.POLICY_AUD && env.TEAM_DOMAIN) {
      const token = request.headers.get('cf-access-jwt-assertion');

      if (!token) {
        return new Response('Missing required CF Access JWT', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      try {
        const JWKS = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
        const { payload } = await jwtVerify(token, JWKS, {
          issuer: env.TEAM_DOMAIN,
          audience: env.POLICY_AUD,
        });
        console.log('Authenticated user:', payload.email || payload.sub);
      } catch (error: any) {
        return new Response(`Invalid token: ${error.message}`, {
          status: 403,
          headers: {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    // Handle API routes
    if (pathname.startsWith('/api/')) {
      // Option 1: Proxy to external API backend (if configured)
      if (env.API_BACKEND_URL) {
        try {
          const apiUrl = new URL(pathname + url.search, env.API_BACKEND_URL);
          const apiRequest = new Request(apiUrl.toString(), {
            method: request.method,
            headers: request.headers,
            body: request.body,
          });
          
          const apiResponse = await fetch(apiRequest);
          const responseBody = await apiResponse.text();
          
          return new Response(responseBody, {
            status: apiResponse.status,
            statusText: apiResponse.statusText,
            headers: {
              ...Object.fromEntries(apiResponse.headers),
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error: any) {
          return new Response(
            JSON.stringify({
              error: 'Failed to proxy API request',
              message: error.message,
            }),
            {
              status: 502,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            }
          );
        }
      }

      // Option 2: Return helpful error message
      return new Response(
        JSON.stringify({
          error: 'API routes not configured',
          message: 'API routes need to be handled by Cloudflare Pages Functions or an API backend.',
          path: pathname,
          solutions: [
            '1. Deploy to Cloudflare Pages (FREE) - automatically handles API routes in _expo/functions/api/',
            '2. Set API_BACKEND_URL environment variable to proxy API requests to an external backend',
            '3. Use Cloudflare Pages Functions (FREE) instead of Workers for API routes',
          ],
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // For all other routes, try to serve from assets (static files)
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    }

    // Fallback: return index.html for SPA routing
    if (env.ASSETS) {
      const indexRequest = new Request(new URL('/', url.origin).toString());
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      if (indexResponse.ok) {
        return indexResponse;
      }
    }

    // Final fallback
    return new Response(
      `<!DOCTYPE html>
<html>
<head>
  <title>HashPass</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
  <h1>HashPass</h1>
  <p>Loading...</p>
  <p>If assets are not loading, ensure ASSETS binding is configured in wrangler.toml</p>
  <p>Path: ${pathname}</p>
  <p><strong>Note:</strong> For API routes, use Cloudflare Pages Functions (free) or set API_BACKEND_URL.</p>
</body>
</html>`,
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  },
};
