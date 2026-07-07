import cap from '@/lib/cap-instance';

export async function POST() {
  try {
    const challenge = await cap.createChallenge({
      challengeCount: 10,
      challengeSize: 32,
      challengeDifficulty: 3,
    });
    console.log('[captcha/challenge] created token prefix:', String(challenge.token).slice(0, 8));
    return Response.json(challenge);
  } catch (error: any) {
    console.error('[captcha/challenge] Failed to create challenge:', error);
    return Response.json({ error: 'Failed to create captcha challenge' }, { status: 500 });
  }
}
