#!/usr/bin/env node

// Fix Sandra Meza image URL typo (andra -> sandra)

import { createClient } from '@supabase/supabase-js';

async function main() {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('🔍 Fixing Sandra Meza image URL...\n');

  // Find Sandra Meza
  const { data: speakers, error: fetchError } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .ilike('name', '%sandra%meza%');

  if (fetchError) {
    console.error('❌ Error fetching speaker:', fetchError);
    process.exit(1);
  }

  if (!speakers || speakers.length === 0) {
    console.error('❌ Speaker not found');
    process.exit(1);
  }

  const speaker = speakers[0];
  console.log(`Found: ${speaker.name}`);
  console.log(`Current URL: ${speaker.imageurl}\n`);

  // Update to match the actual source URL (which has typo: andra instead of sandra)
  const correctUrl = 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-andra-meza.png';
  
  const { error: updateError } = await supabase
    .from('bsl_speakers')
    .update({ imageurl: correctUrl })
    .eq('id', speaker.id);

  if (updateError) {
    console.error('❌ Error updating:', updateError.message);
    process.exit(1);
  }

  console.log(`✅ Updated ${speaker.name}`);
  console.log(`   Old: ${speaker.imageurl}`);
  console.log(`   New: ${correctUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

