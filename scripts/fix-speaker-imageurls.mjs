#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Remove -1, -2, etc. suffixes from S3 URLs
 */
function normalizeS3Url(url) {
  if (!url) return url;
  
  // Only process S3 URLs
  if (!url.includes('s3.amazonaws.com') && !url.includes('hashpass-assets')) {
    return url;
  }
  
  // Remove -1, -2, etc. before .png
  const normalized = url.replace(/foto-([^/]+)-(\d+)\.png/g, 'foto-$1.png');
  
  return normalized;
}

async function main() {
  console.log('🔧 Fixing speaker imageurls in database...\n');

  // Fetch all speakers
  const { data: speakers, error } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .not('imageurl', 'is', null);

  if (error) {
    console.error('❌ Error fetching speakers:', error);
    process.exit(1);
  }

  console.log(`✅ Found ${speakers.length} speakers with imageurl\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const speaker of speakers) {
    const originalUrl = speaker.imageurl;
    const normalizedUrl = normalizeS3Url(originalUrl);

    if (originalUrl === normalizedUrl) {
      skipped++;
      continue;
    }

    console.log(`📝 ${speaker.name}`);
    console.log(`   Old: ${originalUrl}`);
    console.log(`   New: ${normalizedUrl}`);

    const { error: updateError } = await supabase
      .from('bsl_speakers')
      .update({ imageurl: normalizedUrl })
      .eq('id', speaker.id);

    if (updateError) {
      console.error(`   ❌ Error: ${updateError.message}`);
      errors++;
    } else {
      console.log(`   ✅ Updated\n`);
      updated++;
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);
}

main().catch(console.error);




















