#!/usr/bin/env node

/**
 * Verify which S3 avatar URLs actually exist by checking HTTP access
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', timeout: 5000 });
    return response.ok;
  } catch (err) {
    return false;
  }
}

async function main() {
  console.log('🔍 Checking which S3 avatar URLs actually exist...\n');
  
  const { data: speakers } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .not('name', 'is', null);
  
  const s3Speakers = speakers.filter(s => 
    s.imageurl && (s.imageurl.includes('s3.amazonaws.com') || s.imageurl.includes('hashpass-assets'))
  );
  
  console.log(`📋 Checking ${s3Speakers.length} speakers with S3 URLs...\n`);
  
  const missing = [];
  let found = 0;
  
  for (const speaker of s3Speakers) {
    const exists = await checkUrl(speaker.imageurl);
    if (!exists) {
      missing.push(speaker);
      console.log(`❌ Missing: ${speaker.name} -> ${speaker.imageurl}`);
    } else {
      found++;
      if (found % 10 === 0) {
        process.stdout.write(`\r✅ Checked ${found}...`);
      }
    }
  }
  
  console.log(`\n\n📊 Results:`);
  console.log(`   ✅ Found: ${found}`);
  console.log(`   ❌ Missing: ${missing.length}`);
  console.log(`   📦 Total: ${s3Speakers.length}`);
  
  if (missing.length > 0) {
    console.log(`\n🔍 Missing avatars:\n`);
    missing.forEach((s, i) => {
      console.log(`${i + 1}. ${s.name}`);
      console.log(`   URL: ${s.imageurl}\n`);
    });
  }
}

main().catch(console.error);


