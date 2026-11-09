import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function summarizeRowCounts(contents, target) {
  if (typeof contents !== 'string' || typeof target !== 'string') {
    throw new TypeError('Row counts and backup target are required.');
  }

  const lines = contents.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error('No public tables were counted.');

  let totalRows = 0;
  const tables = new Set();
  for (const line of lines) {
    const separator = line.lastIndexOf('|');
    if (separator <= 0) throw new Error('A row-count line is malformed.');

    const table = line.slice(0, separator);
    const rowText = line.slice(separator + 1);
    if (!table || !/^\d+$/.test(rowText) || tables.has(table)) {
      throw new Error('A row-count line is invalid.');
    }

    const rows = Number(rowText);
    if (!Number.isSafeInteger(rows)) throw new Error('A row count is outside the supported range.');
    totalRows += rows;
    if (!Number.isSafeInteger(totalRows)) throw new Error('The total row count is outside the supported range.');
    tables.add(table);
  }

  if (target === 'core-production' && totalRows === 0) {
    throw new Error('Core production has zero public rows; refusing to publish an empty database snapshot.');
  }

  return { tableCount: tables.size, totalRows };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [, , countsPath, target] = process.argv;
  try {
    const { tableCount, totalRows } = summarizeRowCounts(readFileSync(countsPath, 'utf8'), target);
    process.stdout.write(`${tableCount}|${totalRows}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
