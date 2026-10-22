const CARD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Short, branded contact-card links are redirects only. The card remains
 * private until the HashPass contacts screen resolves it and applies the
 * normal mutual-consent flow; this service never reads or exposes card data.
 */
export async function redirectContactCard(_request: Request, cardId: string): Promise<Response> {
  if (!CARD_ID_PATTERN.test(cardId)) return Response.json({ message: 'Invalid contact card' }, { status: 400 });
  const destination = new URL('https://hashpass.tech/contacts');
  destination.searchParams.set('card', cardId);
  return new Response(null, {
    status: 302,
    headers: {
      'cache-control': 'no-store, max-age=0',
      'referrer-policy': 'no-referrer',
      location: destination.toString(),
    },
  });
}
