#!/usr/bin/env node

// Scrape actual image URLs from blockchainsummit.la and fix speakers without images

import { createClient } from '@supabase/supabase-js';
import https from 'node:https';

const BASE_URL = 'https://blockchainsummit.la/teams';

function slugifyName(name) {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpeakerImageScraper/1.0)'
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        res.resume();
        httpGet(redirectUrl).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Request failed. Status: ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function parseImageTag(html) {
  const imgTagMatch = html.match(/<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*>/i);
  if (!imgTagMatch) return null;
  const tag = imgTagMatch[0];
  const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i);
  const srcsetMatch = tag.match(/\ssrcset=["']([^"']+)["']/i);
  
  const src = srcMatch ? srcMatch[1] : null;
  const srcset = {};
  if (srcsetMatch) {
    const entries = srcsetMatch[1].split(',').map(s => s.trim());
    for (const entry of entries) {
      const [url, size] = entry.split(/\s+/);
      if (url && size) srcset[size] = url;
    }
  }
  return { src, srcset };
}

function pickBestImage({ src, srcset }) {
  if (!src && !srcset) return null;
  if (srcset && srcset['1080w']) return srcset['1080w'];
  if (srcset) {
    const widths = Object.keys(srcset)
      .map(k => parseInt(k, 10))
      .filter(n => !Number.isNaN(n))
      .sort((a, b) => b - a);
    if (widths.length > 0) return srcset[`${widths[0]}w`];
  }
  return src || null;
}

function normalizeImageUrl(url, speakerName) {
  if (!url) return null;
  
  try {
    // Decode URL to handle encoded characters
    const decodedUrl = decodeURIComponent(url);
    
    // Special case: Sandra Meza has typo in source (andra instead of sandra)
    if (speakerName.toLowerCase().includes('sandra') && speakerName.toLowerCase().includes('meza')) {
      if (decodedUrl.includes('foto-sandra-meza')) {
        return decodedUrl.replace('foto-sandra-meza', 'foto-andra-meza');
      }
    }
    
    // Extract the filename from the URL
    const urlMatch = decodedUrl.match(/foto-([^/]+\.(png|jpg|jpeg))/i);
    if (urlMatch) {
      // Extract the name part (without extension)
      const filenamePart = urlMatch[1].replace(/\.(png|jpg|jpeg)$/i, '');
      // Normalize the filename part to remove accents and convert to lowercase
      const normalizedFilename = slugifyName(filenamePart).toLowerCase();
      // Reconstruct URL with normalized filename (lowercase)
      const extension = urlMatch[2].toLowerCase();
      // Replace the filename part, preserving the path structure
      const pathParts = decodedUrl.split('/');
      const filenameIndex = pathParts.length - 1;
      pathParts[filenameIndex] = `foto-${normalizedFilename}.${extension}`;
      return pathParts.join('/');
    }
    
    return decodedUrl;
  } catch (error) {
    // If normalization fails, return the slug-based URL
    const slug = slugifyName(speakerName).toLowerCase();
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
    .select('id, name, imageurl')
    .order('name');

  if (fetchError) {
    console.error('❌ Error fetching speakers:', fetchError);
    process.exit(1);
  }

  console.log(`📊 Found ${speakers.length} speakers\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let noImage = 0;

  for (const speaker of speakers) {
    const slug = slugifyName(speaker.name);
    const url = `${BASE_URL}/${slug}/`;
    
    try {
      console.log(`📥 Fetching ${speaker.name}...`);
      const html = await httpGet(url);
      const parsed = parseImageTag(html);
      const rawImageUrl = parsed ? pickBestImage(parsed) : null;
      
      if (!rawImageUrl) {
        console.log(`⚠️  No image found for ${speaker.name}`);
        noImage++;
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
        continue;
      }
      
      // Normalize image URL
      const normalizedUrl = normalizeImageUrl(rawImageUrl, speaker.name);
      
      // Check if update is needed
      if (normalizedUrl === speaker.imageurl) {
        console.log(`✓ ${speaker.name} - already correct`);
        skipped++;
      } else {
        const { error: updateError } = await supabase
          .from('bsl_speakers')
          .update({ imageurl: normalizedUrl })
          .eq('id', speaker.id);

        if (updateError) {
          console.error(`❌ Error updating ${speaker.name}:`, updateError.message);
          errors++;
        } else {
          console.log(`✅ ${speaker.name}`);
          if (speaker.imageurl) {
            console.log(`   Old: ${speaker.imageurl}`);
          }
          console.log(`   New: ${normalizedUrl}\n`);
          updated++;
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (err) {
      console.error(`❌ Failed to fetch ${speaker.name}:`, err.message);
      errors++;
      // Small delay even on error
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   No Image: ${noImage}`);
  console.log(`   Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

