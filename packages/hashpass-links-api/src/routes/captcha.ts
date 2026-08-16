import { getCapInstance } from '@hashpass/backend';
import { apiError } from '../server';

// Shared Cap (proof-of-work captcha, no third-party keys/network calls)
// instance for this service -- same implementation apps/mobile-app's
// newsletter signup uses, via the factory extracted to
// packages/backend/src/captcha/cap-instance.ts. This namespace keeps this
// service's challenge/token storage isolated from other services.
const cap = getCapInstance('hashpass-links-api');

export async function createCaptchaChallenge(): Promise<Response> {
  try {
    const challenge = await cap.createChallenge({
      challengeCount: 10,
      challengeSize: 32,
      challengeDifficulty: 3,
    });
    return Response.json(challenge);
  } catch {
    return apiError('Failed to create captcha challenge', 500);
  }
}

export async function redeemCaptchaChallenge(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const { token, solutions } = body;

  if (typeof token !== 'string' || !Array.isArray(solutions)) {
    return apiError('Invalid captcha redeem request');
  }

  try {
    const result = await cap.redeemChallenge({ token, solutions });
    if (!result.success) {
      return Response.json({ success: false, error: result.message || 'Verification failed' });
    }
    return Response.json(result);
  } catch {
    return Response.json({ success: false, error: 'Failed to redeem captcha challenge' }, { status: 500 });
  }
}

let validatorOverride: ((token: unknown) => Promise<boolean>) | null = null;

// Test-only dependency injection, matching the setAdminDbForTesting /
// setVerifyClientFactoryForTesting pattern in ../server.ts -- route tests
// exercise real validation logic, not real proof-of-work solving.
export function setCaptchaValidatorForTesting(validator: ((token: unknown) => Promise<boolean>) | null): void {
  validatorOverride = validator;
}

/**
 * Validates a solved captcha token, single-use (Cap deletes the token on
 * successful validation by default). Used by mutating routes that need bot
 * protection -- see createQrLink in ./qr-links.ts.
 */
export async function validateCaptchaToken(token: unknown): Promise<boolean> {
  if (validatorOverride) return validatorOverride(token);
  if (typeof token !== 'string' || !token) return false;
  try {
    const result = await cap.validateToken(token);
    return result.success;
  } catch {
    return false;
  }
}
