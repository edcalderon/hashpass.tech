export const PRODUCTION_AWS_PROFILE = 'hashpass';

export function verifyProductionAwsIdentity(runAws, expectedAccountId) {
  if (typeof expectedAccountId !== 'string' || !expectedAccountId.trim()) {
    throw new Error('AWS_TARGET_ACCOUNT_ID is required for production publication.');
  }

  const result = runAws([
    '--profile', PRODUCTION_AWS_PROFILE,
    'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text',
  ]);
  if (result.status !== 0 || String(result.stdout || '').trim() !== expectedAccountId) {
    throw new Error('The hashpass AWS profile does not match the configured production account.');
  }
}

/**
 * S3 evaluates If-None-Match atomically. A rerender therefore cannot replace
 * bytes already cached at an immutable public URL; publish a new reviewed
 * asset version instead.
 */
export function createImmutableHeroUploadArgs(entry, bucket, region) {
  return [
    '--profile', PRODUCTION_AWS_PROFILE,
    's3api', 'put-object',
    '--bucket', bucket,
    '--key', entry.objectKey,
    '--body', entry.localPath,
    '--region', region,
    '--content-type', 'video/mp4',
    '--cache-control', 'public,max-age=31536000,immutable',
    '--if-none-match', '*',
    '--only-show-errors',
  ];
}
