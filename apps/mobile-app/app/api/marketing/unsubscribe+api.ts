import { getSupabaseServerForRequest } from '../../../lib/supabase-server';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const page = (message: string, form = '') => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HASHPASS email preferences</title><body style="font-family:Arial,sans-serif;max-width:560px;margin:64px auto;padding:24px"><h1>HASHPASS email preferences</h1><p>${message}</p>${form}</body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!uuid.test(token)) return new Response('Invalid unsubscribe link', { status: 400 });
  return page('Stop promotional campaigns from HASHPASS. Account and meeting notifications are separate.', '<form method="post"><button type="submit" style="padding:16px 24px">Unsubscribe / Cancelar suscripción</button></form>');
}
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  if (!uuid.test(token)) return new Response('Invalid unsubscribe link', { status: 400 });
  try {
    const result = await getSupabaseServerForRequest(request).rpc('marketing_unsubscribe', { p_token: token });
    if (result.error) return new Response('Unable to update preferences. Please try again.', { status: 503 });
    if (!result.data) return new Response('Unsubscribe link unavailable', { status: 400 });
    return page('You have been unsubscribed from promotional campaigns. Ya no recibirás estas campañas.');
  } catch { return new Response('Unable to update preferences. Please try again.', { status: 503 }); }
}
