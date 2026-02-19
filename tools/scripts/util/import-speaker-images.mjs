#!/usr/bin/env node

// Imports scraped speaker images into Supabase by matching names.
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/import-speaker-images.mjs \
//     --input=scripts/output/speaker-images.json \
//     --table=profiles --name-col=full_name --avatar-col=avatar_url

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: 'scripts/output/speaker-images.json',
    table: 'profiles',
    nameCol: 'full_name',
    avatarCol: 'avatar_url',
  };
  for (const a of args) {
    const [k, v] = a.split('=');
    if (k === '--input') opts.input = v;
    if (k === '--table') opts.table = v;
    if (k === '--name-col') opts.nameCol = v;
    if (k === '--avatar-col') opts.avatarCol = v;
  }
  return opts;
}

function normalizeName(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    process.exit(1);
  }

  const opts = parseArgs();
  const inputPath = path.resolve(process.cwd(), opts.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const results = Array.isArray(json) ? json : json.results;
  if (!Array.isArray(results)) {
    console.error('Invalid input JSON format. Expected array or { results: [] }');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const r of results) {
    const name = r?.name;
    const image = r?.image;
    if (!name || !image) {
      skipped++;
      continue;
    }

    // Try to find a single profile by name (case/diacritics-insensitive heuristic)
    // We'll fetch candidates with ilike and then match by normalized name.
    const { data: candidates, error: selErr } = await supabase
      .from(opts.table)
      .select(`id, ${opts.nameCol}`)
      .ilike(opts.nameCol, `%${name.split(' ')[0]}%`)
      .limit(50);

    if (selErr) {
      console.error(`Select error for ${name}:`, selErr.message);
      skipped++;
      continue;
    }

    const targetNorm = normalizeName(name);
    let match = null;
    for (const c of candidates || []) {
      const cName = c?.[opts.nameCol];
      if (!cName) continue;
      if (normalizeName(cName) === targetNorm) {
        match = c;
        break;
      }
    }

    if (!match) {
      notFound++;
      console.warn(`No exact match found for: ${name}`);
      continue;
    }

    const { error: updErr } = await supabase
      .from(opts.table)
      .update({ [opts.avatarCol]: image })
      .eq('id', match.id);

    if (updErr) {
      console.error(`Update error for ${name} (${match.id}):`, updErr.message);
      skipped++;
    } else {
      updated++;
      console.log(`✓ Updated ${name} → ${image}`);
    }
  }

  console.log(`\nDone. Updated: ${updated}, Not found: ${notFound}, Skipped: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


