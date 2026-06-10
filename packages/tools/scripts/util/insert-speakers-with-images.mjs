#!/usr/bin/env node

// Inserts speakers into bsl_speakers table with their scraped images
// Usage:
//   EXPO_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/insert-speakers-with-images.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
    process.exit(1);
  }

  const inputPath = path.resolve(process.cwd(), 'scripts/output/speaker-images.json');
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

  // Read speaker data from config/events.ts
  const eventsTsPath = path.resolve(process.cwd(), 'config/events.ts');
  const eventsTs = fs.readFileSync(eventsTsPath, 'utf8');
  
  // Extract speakers section
  const startIdx = eventsTs.indexOf('speakers: [');
  if (startIdx === -1) {
    console.error('Could not find speakers section in config/events.ts');
    process.exit(1);
  }
  
  let i = startIdx + 'speakers: ['.length;
  let depth = 1;
  while (i < eventsTs.length) {
    const ch = eventsTs[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    if (depth === 0) break;
    i++;
  }
  
  const speakersSection = eventsTs.slice(startIdx, i + 1);
  
  // Parse speaker data
  const speakers = [];
  const speakerRegex = /\{\s*id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*title:\s*'([^']+)',\s*company:\s*'([^']+)'\s*\}/g;
  let match;
  while ((match = speakerRegex.exec(speakersSection)) !== null) {
    speakers.push({
      id: match[1],
      name: match[2],
      title: match[3],
      company: match[4]
    });
  }

  console.log(`Found ${speakers.length} speakers in config`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const speaker of speakers) {
    // Find matching image from scraped results
    const imageResult = results.find(r => r.name === speaker.name);
    const imageUrl = imageResult?.image || null;

    if (!imageUrl) {
      console.warn(`⚠ No image found for: ${speaker.name}`);
      skipped++;
      continue;
    }

    try {
      // Try to insert, on conflict update
      const { error } = await supabase
        .from('bsl_speakers')
        .upsert({
          id: speaker.id,
          name: speaker.name,
          title: speaker.title,
          imageurl: imageUrl,
          // Add some default values
          bio: `${speaker.title} at ${speaker.company}`,
          tags: [],
          availability: []
        }, {
          onConflict: 'id'
        });

      if (error) {
        console.error(`Error upserting ${speaker.name}:`, error.message);
        skipped++;
      } else {
        console.log(`✓ ${speaker.name} → ${imageUrl}`);
        inserted++;
      }
    } catch (err) {
      console.error(`Exception for ${speaker.name}:`, err.message);
      skipped++;
    }
  }

  console.log(`\nDone. Inserted/Updated: ${inserted}, Skipped: ${skipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
