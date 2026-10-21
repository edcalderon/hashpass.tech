// Safety dump taken by migrate-tenant-db.mjs before it applies the first pending
// migration to a production database. A failed or unreadable dump aborts the run.
//
// pg_dump must be at least the server's major version (Supabase runs Postgres 17,
// the usual local client is older), so the dump runs in a postgres:17 container.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const MIN_DUMP_BYTES = 100_000;

export function needsPreMigrationDump({ environment, pendingCount, skip }) {
  return environment === 'production' && pendingCount > 0 && !skip;
}

export function dumpFileName(profile, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `pre-migration_${profile}_${stamp}.dump`;
}

function redact(message, url) {
  return String(message).replaceAll(url, '[REDACTED_DATABASE_URL]');
}

export function takePreMigrationDump({ databaseUrl, profile, pending, run = execFileSync }) {
  const dir = process.env.HASHPASS_BACKUP_DIR || join(homedir(), 'hashpass-backups', 'pre-migration');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = dumpFileName(profile);
  const target = join(dir, file);

  try {
    run(
      'docker',
      ['run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'DBURL', '-v', `${dir}:/out`, 'postgres:17',
        'sh', '-c', `pg_dump "$DBURL" -Fc --no-owner --no-privileges -f /out/${file}`],
      { env: { ...process.env, DBURL: databaseUrl }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    if (!existsSync(target)) throw new Error('dump file was not created');
    if (statSync(target).size < MIN_DUMP_BYTES) throw new Error('dump is suspiciously small');
    chmodSync(target, 0o600);
    // A dump that cannot be listed cannot be restored.
    run(
      'docker',
      ['run', '--rm', '-v', `${dir}:/out:ro`, 'postgres:17', 'pg_restore', '-l', `/out/${file}`],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    const detail = error.stderr ? error.stderr.toString().trim() : error.message;
    throw new Error(
      `Pre-migration backup failed for ${profile}; no migration was applied. ${redact(detail, databaseUrl)}\n` +
        'Fix the cause, or pass --skip-backup only if the owner has accepted the risk.',
    );
  }

  console.log(`Pre-migration backup: ${target} (${pending} migration(s) pending)`);

  // Optional off-machine copy. Dumps hold user data, so prefer it to a laptop file.
  // They go under their own prefix: the restore drill and the freshness alarm read
  // prod/core/ and expect scheduled dumps with matching row-count files there.
  const bucket = process.env.DB_BACKUP_BUCKET;
  if (bucket) {
    try {
      const expectedAccount = process.env.AWS_TARGET_ACCOUNT_ID;
      if (!expectedAccount) throw new Error('AWS_TARGET_ACCOUNT_ID is not set, so the hashpass profile cannot be verified');
      const awsProfile = ['--profile', process.env.HASHPASS_AWS_PROFILE || 'hashpass'];
      const account = run('aws', [...awsProfile, 'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'],
        { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
      if (account !== expectedAccount) throw new Error('the selected AWS profile is not the HASHPASS production account');
      run(
        'aws',
        [...awsProfile, 's3api', 'put-object', '--bucket', bucket, '--key', `prod/pre-migration/${file}`, '--body', target,
          '--server-side-encryption', 'AES256', '--tagging', 'tier=daily'],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );
      console.log(`Pre-migration backup uploaded: s3://${bucket}/prod/pre-migration/${file}`);
    } catch (error) {
      console.warn(`Warning: S3 upload skipped (${(error.stderr || error.message).toString().trim().split('\n')[0]}). Local copy kept.`);
    }
  }
  return target;
}
