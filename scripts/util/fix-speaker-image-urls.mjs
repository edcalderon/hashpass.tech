#!/usr/bin/env node

// Fix speaker image URLs to remove accents from filenames
// Updates existing speakers in database with normalized image URLs

import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();

function slugifyName(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeImageUrl(url, speakerName) {
  if (!url) return null;
  
  try {
    // Decode URL to handle encoded characters
    const decodedUrl = decodeURIComponent(url);
    
    // Extract the filename from the URL
    const urlMatch = decodedUrl.match(/foto-([^/]+\.(png|jpg|jpeg))/i);
    if (urlMatch) {
      // Extract the name part (without extension)
      const filenamePart = urlMatch[1].replace(/\.(png|jpg|jpeg)$/i, '');
      // Normalize the filename part to remove accents
      const normalizedFilename = slugifyName(filenamePart);
      // Reconstruct URL with normalized filename
      const extension = urlMatch[2].toLowerCase();
      return decodedUrl.replace(/foto-[^/]+\.(png|jpg|jpeg)/i, `foto-${normalizedFilename}.${extension}`);
    }
    
    // If pattern doesn't match, try to replace any encoded characters in the filename
    const normalized = decodedUrl.replace(/%[0-9A-F]{2}/gi, (match) => {
      try {
        const char = decodeURIComponent(match);
        // If it's an accented character, remove the accent
        return char.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
      } catch {
        return match;
      }
    });
    
    // If still contains encoded characters, use speaker name to generate URL
    if (normalized.includes('%')) {
      const slug = slugifyName(speakerName);
      return `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`;
    }
    
    return normalized;
  } catch (error) {
    // If normalization fails, use speaker name to generate URL
    const slug = slugifyName(speakerName);
    return `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`;
  }
}

async function main() {
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('🔍 Fetching all speakers from database...\n');

  // Get all speakers
  const { data: speakers, error: fetchError } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl');

  if (fetchError) {
    console.error('❌ Error fetching speakers:', fetchError);
    process.exit(1);
  }

  console.log(`📊 Found ${speakers.length} speakers\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const speaker of speakers) {
    if (!speaker.imageurl) {
      console.log(`⚠️  ${speaker.name} - No image URL, skipping`);
      skipped++;
      continue;
    }

    // Check if URL contains encoded characters or accents
    const hasEncodedChars = speaker.imageurl.includes('%');
    const hasAccents = /[àáâãäåèéêëìíîïòóôõöùúûüýÿñç]/i.test(speaker.imageurl);
    
    if (!hasEncodedChars && !hasAccents) {
      // URL is already normalized
      skipped++;
      continue;
    }

    const normalizedUrl = normalizeImageUrl(speaker.imageurl, speaker.name);
    
    if (normalizedUrl === speaker.imageurl) {
      // No change needed
      skipped++;
      continue;
    }

    try {
      const { error: updateError } = await supabase
        .from('bsl_speakers')
        .update({ imageurl: normalizedUrl })
        .eq('id', speaker.id);

      if (updateError) {
        console.error(`❌ Error updating ${speaker.name}:`, updateError.message);
        errors++;
      } else {
        console.log(`✅ ${speaker.name}`);
        console.log(`   Old: ${speaker.imageurl}`);
        console.log(`   New: ${normalizedUrl}\n`);
        updated++;
      }
    } catch (err) {
      console.error(`❌ Exception updating ${speaker.name}:`, err.message);
      errors++;
    }
  }

  console.log(`\n✅ Done! Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

