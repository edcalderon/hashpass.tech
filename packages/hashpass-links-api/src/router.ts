import { health } from './routes/health';
import { approveChallenge, createChallenge, exchangeChallenge, pollChallenge } from './routes/auth-qr';
import {
  createQrLink,
  deleteQrLink,
  getQrLink,
  getQrLinkAnalytics,
  getQrSlugAvailability,
  listQrLinks,
  redirectQrLink,
  updateQrLink,
} from './routes/qr-links';
import { apiError } from './server';

type Handler = (request: Request, match: RegExpMatchArray) => Promise<Response>;

// Ordered [method, path pattern, handler] table rather than a routing
// library -- this service is deliberately minimal (see the original spec's
// "minimal, high-performance redirect service" requirement) and the whole
// route surface fits on one screen.
const ROUTES: Array<[string, RegExp, Handler]> = [
  ['GET', /^\/api\/health$/, () => health()],
  ['POST', /^\/api\/v1\/auth\/qr\/challenges$/, (request) => createChallenge(request)],
  ['GET', /^\/api\/v1\/auth\/qr\/challenges\/([^/]+)$/, (request, match) => pollChallenge(request, match[1])],
  [
    'POST',
    /^\/api\/v1\/auth\/qr\/challenges\/([^/]+)\/approve$/,
    (request, match) => approveChallenge(request, match[1]),
  ],
  ['POST', /^\/api\/v1\/auth\/qr\/exchange$/, (request) => exchangeChallenge(request)],
  // HashPass Links (custom/dynamic QR links) -- see README "QR link
  // lifecycle" section.
  ['GET', /^\/q\/([^/]+)$/, (request, match) => redirectQrLink(request, match[1])],
  ['GET', /^\/api\/v1\/qr-links$/, (request) => listQrLinks(request)],
  ['POST', /^\/api\/v1\/qr-links$/, (request) => createQrLink(request)],
  ['GET', /^\/api\/v1\/qr-links\/slug-availability$/, (request) => getQrSlugAvailability(request)],
  ['GET', /^\/api\/v1\/qr-links\/([^/]+)$/, (request, match) => getQrLink(request, match[1])],
  ['PATCH', /^\/api\/v1\/qr-links\/([^/]+)$/, (request, match) => updateQrLink(request, match[1])],
  ['DELETE', /^\/api\/v1\/qr-links\/([^/]+)$/, (request, match) => deleteQrLink(request, match[1])],
  ['GET', /^\/api\/v1\/qr-links\/([^/]+)\/analytics$/, (request, match) => getQrLinkAnalytics(request, match[1])],
];

export async function handleRequest(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);

  for (const [method, pattern, handler] of ROUTES) {
    if (request.method !== method) continue;
    const match = pathname.match(pattern);
    if (match) return handler(request, match);
  }

  return apiError('Not found', 404);
}
