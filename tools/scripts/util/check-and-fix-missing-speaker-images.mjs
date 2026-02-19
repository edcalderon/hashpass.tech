#!/usr/bin/env node

// Check and fix missing speaker images by scraping from blockchainsummit.la

import { createClient } from '@supabase/supabase-js';
import https from 'node:https';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const BASE_URL = 'https://blockchainsummit.la/teams';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.end();
  });
}

function parseImageTag(html) {
  // Try multiple patterns to find the image
  const patterns = [
    /<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*>/i,
    /<img[^>]*class=["'][^"']*attachment-[^"']*["'][^>]*>/i,
    /<img[^>]*src=["']([^"']*foto[^"']*)["'][^>]*>/i,
    /<img[^>]*src=["']([^"']*wp-content[^"']*)["'][^>]*>/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      const tag = match[0];
      const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i);
      const srcsetMatch = tag.match(/\ssrcset=["']([^"']+)["']/i);
      
      const src = srcMatch ? srcMatch[1] : null;
      const srcset = {};
      if (srcsetMatch) {
        const entries = srcsetMatch[1].split(',').map(s => s.trim());
        for (const entry of entries) {
          const parts = entry.trim().split(/\s+/);
          if (parts.length >= 2) {
            const url = parts[0];
            const size = parts[1];
            srcset[size] = url;
          }
        }
      }
      if (src || Object.keys(srcset).length > 0) {
        return { src, srcset };
      }
    }
  }
  return null;
}

function removeSizeSuffix(url) {
  if (!url) return null;
  // Remove WordPress size suffixes like -768x768, -300x300, etc.
  return url.replace(/-\d+x\d+(?=\.(png|jpg|jpeg|svg|webp)$)/i, '');
}

function pickBestImage({ src, srcset }) {
  if (!src && !srcset) return null;
  
  // Prefer largest image from srcset
  if (srcset && Object.keys(srcset).length > 0) {
    const widths = Object.keys(srcset)
      .map(k => parseInt(k.replace('w', ''), 10))
      .filter(n => !Number.isNaN(n))
      .sort((a, b) => b - a);
    if (widths.length > 0) {
      const bestSrcset = srcset[`${widths[0]}w`] || srcset[Object.keys(srcset)[0]];
      // Try to get full-size version (without size suffix)
      const fullSize = removeSizeSuffix(bestSrcset);
      return fullSize || bestSrcset;
    }
  }
  
  // Try to get full-size version from src
  const fullSizeSrc = removeSizeSuffix(src);
  return fullSizeSrc || src || null;
}

function normalizeImageUrl(url, speakerName) {
  if (!url) return null;
  
  try {
    // Decode URL to handle encoded characters
    let decodedUrl = url;
    try {
      decodedUrl = decodeURIComponent(url);
    } catch (e) {
      decodedUrl = url;
    }
    
    // Special case: Sandra Meza has typo in source (andra instead of sandra)
    if (speakerName.toLowerCase().includes('sandra') && speakerName.toLowerCase().includes('meza')) {
      if (decodedUrl.includes('foto-sandra-meza')) {
        decodedUrl = decodedUrl.replace('foto-sandra-meza', 'foto-andra-meza');
      }
    }
    
    // Extract the filename from the URL
    const urlMatch = decodedUrl.match(/foto-([^/]+\.(png|jpg|jpeg|svg|webp))/i);
    if (urlMatch) {
      // Extract the name part (without extension)
      const filenamePart = urlMatch[1].replace(/\.(png|jpg|jpeg|svg|webp)$/i, '');
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
    console.warn(`⚠️ Error normalizing URL for ${speakerName}:`, error.message);
    // If normalization fails, return the slug-based URL
    const slug = slugifyName(speakerName).toLowerCase();
    return `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`;
  }
}

async function checkImageExists(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const speakerNames = [
    'María Paula Rodríguez',
    'Willian Santos',
    'Steffen Härting',
    'Alireza Siadat',
    'Omar Castelblanco',
    'Nathaly Diniz',
    'Juan Pablo Salazar',
    'Stephanie Sánchez',
    'Albert Prat',
    'Luisa Cárdenas',
    'Daniel Marulanda',
    'Diego Osuna',
    'Juliana Franco',
    'Javier Lozano',
    'Oscar Moratto',
    'Miguel Ángel Calero',
    'Wilder Rosero',
    'Carlos Salinas'
  ];

  console.log('🔍 Fetching speakers from database...\n');

  const { data: speakers, error: fetchError } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .in('name', speakerNames);

  if (fetchError) {
    console.error('❌ Error fetching speakers:', fetchError);
    process.exit(1);
  }

  console.log(`📊 Found ${speakers.length} speakers to check\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let noImage = 0;

  for (const speaker of speakers) {
    const slug = slugifyName(speaker.name);
    const url = `${BASE_URL}/${slug}/`;
    
    console.log(`\n📥 Checking ${speaker.name}...`);
    console.log(`   Current URL: ${speaker.imageurl || 'NONE'}`);
    console.log(`   Scraping from: ${url}`);
    
    try {
      const html = await httpGet(url);
      const parsed = parseImageTag(html);
      
      if (!parsed) {
        console.log(`   ⚠️  No image tag found in HTML`);
        noImage++;
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      const rawImageUrl = pickBestImage(parsed);
      
      if (!rawImageUrl) {
        console.log(`   ⚠️  No image URL extracted`);
        noImage++;
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      console.log(`   Found image: ${rawImageUrl}`);
      
      // Try full-size version first (remove size suffix like -768x768)
      const fullSizeUrl = removeSizeSuffix(rawImageUrl);
      let finalUrl = rawImageUrl;
      
      if (fullSizeUrl !== rawImageUrl) {
        console.log(`   Trying full-size: ${fullSizeUrl}`);
        const fullSizeExists = await checkImageExists(fullSizeUrl);
        if (fullSizeExists) {
          finalUrl = fullSizeUrl;
          console.log(`   ✓ Full-size URL exists, using it`);
        } else {
          // Try original with size suffix
          console.log(`   Full-size not found, trying original: ${rawImageUrl}`);
          const originalExists = await checkImageExists(rawImageUrl);
          if (originalExists) {
            finalUrl = rawImageUrl;
            console.log(`   ✓ Original URL with size suffix exists, using it`);
          } else {
            // Try normalized lowercase version
            const normalizedUrl = normalizeImageUrl(fullSizeUrl, speaker.name);
            console.log(`   Trying normalized: ${normalizedUrl}`);
            const normalizedExists = await checkImageExists(normalizedUrl);
            if (normalizedExists) {
              finalUrl = normalizedUrl;
              console.log(`   ✓ Normalized URL exists, using it`);
            } else {
              console.log(`   ❌ Image does not exist at any URL variant`);
              errors++;
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
          }
        }
      } else {
        // No size suffix, check original
        const originalExists = await checkImageExists(rawImageUrl);
        if (!originalExists) {
          // Try normalized lowercase version
          const normalizedUrl = normalizeImageUrl(rawImageUrl, speaker.name);
          console.log(`   Trying normalized: ${normalizedUrl}`);
          const normalizedExists = await checkImageExists(normalizedUrl);
          if (normalizedExists) {
            finalUrl = normalizedUrl;
            console.log(`   ✓ Normalized URL exists, using it`);
          } else {
            console.log(`   ❌ Image does not exist at either URL`);
            errors++;
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
        } else {
          console.log(`   ✓ Original URL exists, using it (preserving case)`);
        }
      }
      
      // Check if update is needed
      if (finalUrl === speaker.imageurl) {
        console.log(`   ✓ Already correct`);
        skipped++;
      } else {
        const { error: updateError } = await supabase
          .from('bsl_speakers')
          .update({ imageurl: finalUrl })
          .eq('id', speaker.id);

        if (updateError) {
          console.error(`   ❌ Error updating:`, updateError.message);
          errors++;
        } else {
          console.log(`   ✅ Updated from: ${speaker.imageurl || 'NONE'}`);
          console.log(`      To: ${finalUrl}`);
          updated++;
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 800));

    } catch (err) {
      console.error(`   ❌ Failed:`, err.message);
      errors++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`\n\n✅ Done!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   No Image: ${noImage}`);
  console.log(`   Errors: ${errors}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

