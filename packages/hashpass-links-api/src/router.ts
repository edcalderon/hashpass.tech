import { health } from './routes/health';
import { redirectInvite } from './routes/invite';
import { redirectContactCard } from './routes/contact-card';
import { redirectWalletShare } from './routes/wallet-share';
import { redirectPassShare } from './routes/pass-share';
import { approveChallenge, createChallenge, exchangeChallenge, pollChallenge } from './routes/auth-qr';
import { createCaptchaChallenge, redeemCaptchaChallenge } from './routes/captcha';
import {
  createAttendingArtwork,
  getAttendingArtworkShare,
  redirectAttendingArtworkImage,
} from './routes/attending-artworks';
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

const FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#071a29"/><circle cx="16" cy="16" r="10" fill="none" stroke="#19d3c5" stroke-width="2"/><path d="m12 9 8 7-8 7" fill="none" stroke="#f04444" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/></svg>';

function favicon(): Response {
  return new Response(FAVICON_SVG, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

// Ordered [method, path pattern, handler] table rather than a routing
// library -- this service is deliberately minimal (see the original spec's
// "minimal, high-performance redirect service" requirement) and the whole
// route surface fits on one screen.
const ROUTES: Array<[string, RegExp, Handler]> = [
  ['GET', /^\/favicon\.(?:ico|svg)$/, () => Promise.resolve(favicon())],
  ['GET', /^\/api\/health$/, () => health()],
  ['POST', /^\/api\/captcha\/challenge$/, () => createCaptchaChallenge()],
  ['POST', /^\/api\/captcha\/redeem$/, (request) => redeemCaptchaChallenge(request)],
  ['POST', /^\/api\/v1\/attending-artworks$/, (request) => createAttendingArtwork(request)],
  ['GET', /^\/a\/([^/]+)$/, (request, match) => getAttendingArtworkShare(request, match[1])],
  ['GET', /^\/a\/([^/]+)\/image$/, (request, match) => redirectAttendingArtworkImage(request, match[1])],
  ['POST', /^\/api\/v1\/auth\/qr\/challenges$/, (request) => createChallenge(request)],
  ['GET', /^\/api\/v1\/auth\/qr\/challenges\/([^/]+)$/, (request, match) => pollChallenge(request, match[1])],
  [
    'POST',
    /^\/api\/v1\/auth\/qr\/challenges\/([^/]+)\/approve$/,
    (request, match) => approveChallenge(request, match[1]),
  ],
  ['POST', /^\/api\/v1\/auth\/qr\/exchange$/, (request) => exchangeChallenge(request)],
  ['GET', /^\/c\/([^/]+)$/, (request, match) => redirectContactCard(request, match[1])],
  ['GET', /^\/p\/([^/]+)$/, (request, match) => redirectPassShare(request, match[1])],
  ['GET', /^\/w\/([^/]+)\/([^/]+)\/([^/]+)$/, (request, match) => redirectWalletShare(request, match[1], match[2], match[3])],
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

// The public short-link domains (hpass.id, hashpass.link, hashp.link) all
// front this same service -- a real visitor who lands on the bare domain
// (mistyped/truncated a QR code, or just typed the domain out of curiosity)
// is a plausible, non-bot case worth a friendly redirect instead of the raw
// JSON 404 every other unmatched route gets. hashpass.club, not
// hashpass.tech, since that's where QR/link management actually lives.
//
// hashpass.link is deliberately the odd one out: it's the designated
// cosmetic/branding domain for the QR feature specifically (hpass.id is the
// primary functional short-link domain actually embedded in generated
// links; hashp.link is just a defensive alias) -- so its bare domain sends
// visitors straight to the QR showcase/generator page instead of the
// generic club homepage, reinforcing that association for anyone who types
// or sees the domain on its own.
const DEFAULT_BARE_DOMAIN_REDIRECT_TARGET = 'https://hashpass.club';
const BARE_DOMAIN_REDIRECT_TARGETS_BY_HOST: Record<string, string> = {
  'hashpass.link': 'https://hashpass.club/qr/',
};

export async function handleRequest(request: Request): Promise<Response> {
  const { pathname, hostname } = new URL(request.url);

  if (hostname === 'invite.hashpass.app') {
    if (pathname !== '/') return apiError('Not found', 404);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    return redirectInvite(request);
  }

  if (request.method === 'GET' && (pathname === '/' || pathname === '')) {
    const target = BARE_DOMAIN_REDIRECT_TARGETS_BY_HOST[hostname] ?? DEFAULT_BARE_DOMAIN_REDIRECT_TARGET;
    return Response.redirect(target, 302);
  }

  for (const [method, pattern, handler] of ROUTES) {
    if (request.method !== method) continue;
    const match = pathname.match(pattern);
    if (match) return handler(request, match);
  }

  return apiError('Not found', 404);
}
