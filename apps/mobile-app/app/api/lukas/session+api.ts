import { getBetterAuthSessionUser } from '@/lib/server/better-auth-session-client';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://lukas.hashpass.tech',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  try {
    const user = await getBetterAuthSessionUser(request);
    if (!user) return json({ error: 'No active HashPass session found' }, 401);
    return json({
      success: true,
      user: { id: user.id, email: user.email, name: [user.first_name, user.last_name].filter(Boolean).join(' ') },
    });
  } catch (error) {
    console.error('[lukas/session] unhandled error:', error);
    return json({ error: 'Unable to verify the HashPass session' }, 500);
  }
}
