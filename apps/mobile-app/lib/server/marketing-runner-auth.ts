import { timingSafeEqual } from 'node:crypto';

export function marketingRunnerAuthorized(request: Request, expected = process.env.MARKETING_RUNNER_TOKEN || '') {
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  return expected.length >= 32 && Buffer.byteLength(supplied) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
