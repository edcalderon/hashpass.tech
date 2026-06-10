#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

async function main() {
  const fileArg = process.argv[2] || path.resolve(__dirname, '..', 'speakers.json');
  const raw = fs.readFileSync(fileArg, 'utf-8');
  const speakers = JSON.parse(raw);
  for (const s of speakers) {
    const { error } = await supabase.from('bsl_speakers').upsert({
      id: s.id,
      name: s.name,
      title: s.title,
      linkedin: s.linkedin,
      bio: s.bio,
      imageUrl: s.imageUrl,
      tags: s.tags || [],
      availability: s.availability || [],
    });
    if (error) {
      console.error('Upsert error for', s.id, error.message);
    } else {
      console.log('Upserted speaker', s.id);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


