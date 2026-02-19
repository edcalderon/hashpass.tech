#!/usr/bin/env node

// Fix speaker image URLs to convert filenames to lowercase
// e.g., foto-Maria-Paula-Rodriguez.png -> foto-maria-paula-rodriguez.png

import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function normalizeImageUrlCase(imageUrl) {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname;
    const parts = pathname.split('/');
    const filenameWithExtension = parts[parts.length - 1];

    // Check if filename matches the 'foto-name.ext' pattern (case-insensitive)
    const filenameMatch = filenameWithExtension.match(/^foto-(.+?)\.(png|jpg|jpeg|svg)$/i);
    if (filenameMatch) {
      const namePart = filenameMatch[1];
      const extension = filenameMatch[2].toLowerCase();
      
      // Check if name part has any uppercase letters
      if (namePart !== namePart.toLowerCase()) {
        // Convert name part to lowercase
        const normalizedNamePart = namePart.toLowerCase();
        const newFilename = `foto-${normalizedNamePart}.${extension}`;
        
        // Reconstruct the URL
        parts[parts.length - 1] = newFilename;
        url.pathname = parts.join('/');
        return url.toString();
      }
    }
  } catch (e) {
    console.warn(`⚠️ Could not parse or normalize URL: ${imageUrl}. Error: ${e.message}`);
  }
  return imageUrl; // Return original if cannot normalize or already lowercase
}

async function main() {
  console.log('🔍 Fetching all speakers from database...');

  const { data: speakers, error } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl');

  if (error) {
    console.error('❌ Error fetching speakers:', error.message);
    process.exit(1);
  }

  console.log(`\n📊 Found ${speakers.length} speakers\n`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const speaker of speakers) {
    const oldImageUrl = speaker.imageurl;
    const newImageUrl = normalizeImageUrlCase(oldImageUrl);

    if (oldImageUrl && newImageUrl && oldImageUrl !== newImageUrl) {
      console.log(`\n✅ ${speaker.name}`);
      console.log(`   Old: ${oldImageUrl}`);
      console.log(`   New: ${newImageUrl}`);

      const { error: updateError } = await supabase
        .from('bsl_speakers')
        .update({ imageurl: newImageUrl })
        .eq('id', speaker.id);

      if (updateError) {
        console.error(`❌ Error updating ${speaker.name}:`, updateError.message);
        errorCount++;
      } else {
        updatedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log(`\n✅ Done! Updated: ${updatedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

