import { health } from './routes/health';
import { approveChallenge, createChallenge, exchangeChallenge, pollChallenge } from './routes/auth-qr';
import { apiError, shortOrigin } from './server';

type Handler = (request: Request, match: RegExpMatchArray) => Promise<Response>;

// Ordered [method, path pattern, handler] table rather than a routing
// library -- this service is deliberately minimal (see the original spec's
// "minimal, high-performance redirect service" requirement) and the whole
// route surface fits on one screen. `Phase 2` entries return 501 for now:
// their DB migration and validation logic already exist
// (@hashpass/backend's qr-links module) but aren't wired to a live route
// yet -- see packages/hashpass-links-api/README.md.
const ROUTES: Array<[string, RegExp, Handler]> = [
  ['GET', /^\/api\/health$/, () => health()],
  ['POST', /^\/api\/v1\/auth\/qr\/challenges$/, (request) => createChallenge(request, shortOrigin())],
  ['GET', /^\/api\/v1\/auth\/qr\/challenges\/([^/]+)$/, (request, match) => pollChallenge(request, match[1])],
  [
    'POST',
    /^\/api\/v1\/auth\/qr\/challenges\/([^/]+)\/approve$/,
    (request, match) => approveChallenge(request, match[1]),
  ],
  ['POST', /^\/api\/v1\/auth\/qr\/exchange$/, (request) => exchangeChallenge(request)],
  // Phase 2 (not yet live -- see README "Phase 2" section):
  ['GET', /^\/q\/([^/]+)$/, async () => phase2NotReady()],
  ['GET', /^\/api\/v1\/qr-links$/, async () => phase2NotReady()],
  ['POST', /^\/api\/v1\/qr-links$/, async () => phase2NotReady()],
  ['GET', /^\/api\/v1\/qr-links\/([^/]+)$/, async () => phase2NotReady()],
  ['PATCH', /^\/api\/v1\/qr-links\/([^/]+)$/, async () => phase2NotReady()],
  ['GET', /^\/api\/v1\/qr-links\/([^/]+)\/analytics$/, async () => phase2NotReady()],
];

function phase2NotReady(): Response {
  return apiError('This endpoint is not live yet (Phase 2).', 501);
}

export async function handleRequest(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);

  for (const [method, pattern, handler] of ROUTES) {
    if (request.method !== method) continue;
    const match = pathname.match(pattern);
    if (match) return handler(request, match);
  }

  return apiError('Not found', 404);
}
