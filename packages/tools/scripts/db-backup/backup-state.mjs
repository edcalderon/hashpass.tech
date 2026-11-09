import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const DUMP_AGE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;

function dumpNamePattern(database) {
  const escapedDatabase = database.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedDatabase}_[0-9]{8}T[0-9]{6}Z\\.dump$`);
}

function countsNamePattern(database) {
  const escapedDatabase = database.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedDatabase}_[0-9]{8}T[0-9]{6}Z\\.counts\\.txt$`);
}

export function shouldSkipUnchangedBackup({
  currentFingerprint,
  database,
  prefix,
  state,
  dumpSize,
  countsSize,
  tableCount,
  totalRows,
  now,
  minDumpBytes = 100_000,
}) {
  if (!FINGERPRINT_PATTERN.test(currentFingerprint ?? '')) return false;
  if (!state || state.schema_version !== 1 || state.fingerprint_algorithm !== 'pg_restore_sql_sha256_v1') return false;
  if (state.database !== database || state.fingerprint !== currentFingerprint) return false;
  if (!Number.isSafeInteger(dumpSize) || dumpSize < minDumpBytes) return false;
  if (!Number.isSafeInteger(countsSize) || countsSize < 1) return false;
  if (!Number.isSafeInteger(tableCount) || tableCount < 1 || state.table_count !== tableCount) return false;
  if (!Number.isSafeInteger(totalRows) || totalRows < 0 || state.total_rows !== totalRows) return false;

  const dumpKey = state.dump_key;
  const countsKey = state.counts_key;
  if (typeof dumpKey !== 'string' || !dumpKey.startsWith(`${prefix}/`)) return false;
  if (typeof countsKey !== 'string' || !countsKey.startsWith(`${prefix}/`)) return false;
  if (!dumpNamePattern(database).test(basename(dumpKey))) return false;
  if (!countsNamePattern(database).test(basename(countsKey))) return false;
  if (countsKey !== dumpKey.replace(/\.dump$/, '.counts.txt')) return false;

  const dumpedAt = Date.parse(state.dumped_at);
  const nowAt = Date.parse(now);
  const stamp = basename(dumpKey).match(/_([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z\.dump$/);
  if (!stamp) return false;
  const expectedDumpedAt = `${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`;
  if (state.dumped_at !== expectedDumpedAt) return false;
  if (!Number.isFinite(dumpedAt) || !Number.isFinite(nowAt) || dumpedAt > nowAt) return false;
  return nowAt - dumpedAt < DUMP_AGE_LIMIT_MS;
}

function readState(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , statePath, database, prefix, currentFingerprint, dumpSize, countsSize, tableCount, totalRows, now] = process.argv;
  const skip = shouldSkipUnchangedBackup({
    currentFingerprint,
    database,
    prefix,
    state: readState(statePath),
    dumpSize: Number(dumpSize),
    countsSize: Number(countsSize),
    tableCount: Number(tableCount),
    totalRows: Number(totalRows),
    now,
  });
  process.stdout.write(skip ? 'skip\n' : 'full\n');
}
