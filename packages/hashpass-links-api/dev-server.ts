// Minimal local dev server: wraps handleRequest() in a plain Node HTTP
// server so apps/web-app and apps/mobile-app can point NEXT_PUBLIC_/
// EXPO_PUBLIC_LINKS_API_BASE_URL at a real, locally-running instance of
// this service instead of a deployed Lambda. Requires SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY to be set (see README.md).
import { createServer } from 'node:http';
import { handleRequest } from './src/router';

const PORT = Number(process.env.PORT) || 8788;

function collectBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const method = req.method || 'GET';
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(', '));
    }

    const body = method === 'GET' || method === 'HEAD' ? undefined : await collectBody(req);
    const request = new Request(url, { method, headers, body });

    // Local dev only: mirrors the CORS behavior lambda/index.ts applies in
    // production (specific-origin echo + credentials), so the browser-binding
    // cookie flow works the same way against this server as it will in Lambda.
    const origin = req.headers.origin;
    const response = await handleRequest(request);
    const responseHeaders = new Headers(response.headers);
    if (origin) {
      responseHeaders.set('access-control-allow-origin', origin);
      responseHeaders.set('access-control-allow-credentials', 'true');
    }
    if (method === 'OPTIONS') {
      responseHeaders.set('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
      responseHeaders.set('access-control-allow-headers', 'Content-Type, Authorization, Cache-Control, X-Hashpass-App-Id, X-Hashpass-Binding, Idempotency-Key');
      res.writeHead(204, Object.fromEntries(responseHeaders));
      res.end();
      return;
    }

    const responseBody = await response.text();
    res.writeHead(response.status, Object.fromEntries(responseHeaders));
    res.end(responseBody);
  } catch (error) {
    console.error('[hashpass-links-api dev-server]', error);
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Internal Server Error' }));
  }
});

server.listen(PORT, () => {
  console.log(`hashpass-links-api dev server listening on http://localhost:${PORT}`);
});
