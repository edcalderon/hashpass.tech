import cap from '@/lib/cap-instance';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { token, solutions } = body;

    if (!token || !Array.isArray(solutions)) {
      return Response.json({ success: false, error: 'Invalid request body' }, { status: 400 });
    }

    // Debug: log what we received so we can verify solutions manually
    console.log('[captcha/redeem] token prefix:', String(token).slice(0, 8));
    console.log('[captcha/redeem] solutions count:', solutions.length, 'types:', solutions.slice(0,3).map((s: any) => typeof s), 'first 3:', solutions.slice(0,3));

    const result = await cap.redeemChallenge({ token, solutions });

    // Map 'message' → 'error' so the cap-widget receives the field it expects
    if (!result.success) {
      const msg = (result as any).message || 'Verification failed';
      console.log('[captcha/redeem] failed:', msg);
      return Response.json({ success: false, error: msg });
    }

    console.log('[captcha/redeem] success, token prefix:', String(result.token).slice(0, 8));
    return Response.json(result);
  } catch (error: any) {
    console.error('[captcha/redeem] threw:', error?.message || error);
    return Response.json({ success: false, error: 'Failed to redeem challenge' }, { status: 500 });
  }
}
