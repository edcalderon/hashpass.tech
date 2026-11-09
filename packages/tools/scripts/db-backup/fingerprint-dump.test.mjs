import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const fingerprintScript = fileURLToPath(new URL('./fingerprint-dump.sh', import.meta.url));

test('fingerprint is stable for the same restore stream and changes with database content', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'hashpass-backup-fingerprint-'));
  const dumpPath = join(tempDir, 'core-prod.dump');
  writeFileSync(dumpPath, 'fixture');
  const mockBin = join(tempDir, 'bin');
  mkdirSync(mockBin);
  const argsPath = join(tempDir, 'pg-restore-args.txt');
  const mockPgRestore = join(mockBin, 'pg_restore');
  writeFileSync(
    mockPgRestore,
    '#!/usr/bin/env bash\nset -euo pipefail\nprintf "%s\\n" "$@" > "$PG_RESTORE_ARGS_FILE"\nprintf "%s" "$FINGERPRINT_SQL"\n',
  );
  chmodSync(mockPgRestore, 0o755);

  const invoke = (sql) => {
    const child = spawnSync(fingerprintScript, [dumpPath], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${mockBin}:${process.env.PATH}`,
        FINGERPRINT_SQL: sql,
        PG_RESTORE_ARGS_FILE: argsPath,
      },
    });
    assert.equal(child.status, 0, child.stderr);
    return child.stdout.trim();
  };

  try {
    const sameSql = 'CREATE TABLE public.sample (id integer);\nCOPY public.sample (id) FROM stdin;\n1\n\\.\n';
    const first = invoke(sameSql);
    const repeated = invoke(sameSql);
    const changed = invoke(sameSql.replace('1\n', '2\n'));

    assert.equal(first, createHash('sha256').update(sameSql).digest('hex'));
    assert.equal(repeated, first);
    assert.notEqual(changed, first);
    assert.match(readFileSync(argsPath, 'utf8'), /--restrict-key=hashpassfingerprintv1/);
    assert.match(readFileSync(argsPath, 'utf8'), /--file=-/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
