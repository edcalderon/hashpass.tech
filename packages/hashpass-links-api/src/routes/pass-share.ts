import { apiError } from '../server';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,160}$/;

/**
 * Branded pass-share links are redirects only. The core API owns the token
 * hash and public-data policy; this short-link service never reads pass data.
 */
export async function redirectPassShare(_request: Request, token: string): Promise<Response> {
  if (!TOKEN_PATTERN.test(token)) return apiError('Invalid pass share', 404);
  return new Response(null, {
    status: 302,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'referrer-policy': 'no-referrer',
      location: `https://hashpass.tech/public-pass/${encodeURIComponent(token)}`,
    },
  });
}
