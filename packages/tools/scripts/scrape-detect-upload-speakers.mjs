#!/usr/bin/env node

/**
 * Comprehensive script to:
 * 1. Scrape speakers from blockchainsummit.la
 * 2. Detect new and missing speakers
 * 3. Download avatars
 * 4. Upload avatars to S3
 * 5. Update database with S3 URLs
 */

import puppeteer from "puppeteer";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase client
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// S3 client - Speaker avatars bucket uses EXPO_PUBLIC_AWS_S3_BUCKET (hashpass-assets)
const BUCKET_NAME = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || 'hashpass-assets';
const CDN_URL = (process.env.AWS_S3_CDN_URL || process.env.AWS_S3_BUCKET_URL || '').trim();
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const SPEAKER_AVATARS_PREFIX = 'speakers/avatars/';

const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  } : undefined,
});

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error('❌ Missing AWS credentials');
  console.error('   Please set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file');
  process.exit(1);
}

/**
 * Convert speaker name to filename
 */
function speakerNameToFilename(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Get S3 URL for a speaker avatar
 */
function getS3AvatarUrl(speakerName) {
  const filename = speakerNameToFilename(speakerName);
  const s3Key = `${SPEAKER_AVATARS_PREFIX}foto-${filename}.png`;
  
  if (CDN_URL && !CDN_URL.startsWith('s3://') && !CDN_URL.startsWith('arn:')) {
    return `${CDN_URL}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
  }
  
  return `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
}

/**
 * Check if file exists in S3
 */
async function fileExistsInS3(s3Key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
    });
    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Upload image to S3
 */
async function uploadToS3(buffer, s3Key, contentType = 'image/png') {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await s3Client.send(command);

    // Construct URL
    let url;
    if (CDN_URL && !CDN_URL.startsWith('s3://') && !CDN_URL.startsWith('arn:')) {
      url = `${CDN_URL}/${s3Key}`.replace(/\/+/g, '/').replace(':/', '://');
    } else {
      url = `https://${BUCKET_NAME}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
    }

    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Find speaker in database by name (fuzzy match)
 */
async function findSpeakerByName(name) {
  // Try exact match first
  const { data: exactMatch } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .ilike('name', name)
    .limit(1);

  if (exactMatch && exactMatch.length > 0) {
    return exactMatch[0];
  }

  // Try partial match
  const { data: partialMatch } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl')
    .ilike('name', `%${name}%`)
    .limit(5);

  if (partialMatch && partialMatch.length > 0) {
    // Return the best match (shortest name that contains the search term)
    return partialMatch.sort((a, b) => a.name.length - b.name.length)[0];
  }

  return null;
}

/**
 * Generate UUID v5 from slug
 */
async function generateUUIDv5(slug) {
  const crypto = await import('node:crypto');
  const namespaceUUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const namespaceBytes = Buffer.from(namespaceUUID.replace(/-/g, ''), 'hex');
  const nameBytes = Buffer.from(slug, 'utf8');
  const hash = crypto.createHash('sha1');
  hash.update(Buffer.concat([namespaceBytes, nameBytes]));
  const hashBytes = hash.digest();
  // Set version (5) and variant bits
  hashBytes[6] = (hashBytes[6] & 0x0f) | 0x50;
  hashBytes[8] = (hashBytes[8] & 0x3f) | 0x80;
  // Format as UUID string
  return [
    hashBytes.slice(0, 4).toString('hex'),
    hashBytes.slice(4, 6).toString('hex'),
    hashBytes.slice(6, 8).toString('hex'),
    hashBytes.slice(8, 10).toString('hex'),
    hashBytes.slice(10, 16).toString('hex')
  ].join('-');
}

/**
 * Extract company from title
 */
function extractCompanyFromTitle(title) {
  if (!title) return null;
  const atMatch = title.match(/@\s*([^@]+?)(?:\s|$)/);
  if (atMatch) return atMatch[1].trim();
  
  const deMatch = title.match(/\s+de\s+([A-Z][^/]+?)(?:\s|$)/);
  if (deMatch) return deMatch[1].trim();
  
  return null;
}

/**
 * Main scraping function
 */
async function scrapeAndProcessSpeakers() {
  console.log('🚀 Starting comprehensive speaker scrape and upload process...\n');
  console.log(`📦 Using S3 bucket: ${BUCKET_NAME}\n`);

  // Get existing speakers from database
  console.log('📋 Fetching existing speakers from database...');
  const { data: existingSpeakers, error: dbError } = await supabase
    .from('bsl_speakers')
    .select('id, name, imageurl');

  if (dbError) {
    console.error('❌ Error fetching speakers:', dbError);
    process.exit(1);
  }

  const existingNames = new Set(existingSpeakers.map(s => s.name.toLowerCase()));
  console.log(`✅ Found ${existingSpeakers.length} existing speakers in database\n`);

  // Launch browser and scrape
  console.log('🌐 Launching browser to scrape speakers...');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  console.log('📡 Navigating to blockchainsummit.la...');
  await page.goto('https://blockchainsummit.la/', { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Find all speaker links
  const speakerLinks = await page.$$eval('a[href*="/teams/"]', links =>
    Array.from(new Set(links.map(l => l.href.split("?")[0])))
  );
  console.log(`🔍 Found ${speakerLinks.length} speaker profiles on website\n`);

  let downloaded = 0;
  let uploaded = 0;
  let updated = 0;
  let added = 0;
  let failed = 0;
  let skipped = 0;

  // Process each speaker
  for (let link of speakerLinks) {
    try {
      console.log(`\n🔍 Processing: ${link}`);
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Extract speaker name - try multiple selectors
      let name = '';
      try {
        // Try to find the speaker name in various ways
        const nameSelectors = [
          'h1.entry-title',
          '.entry-title',
          'h1:not([class*="site"]):not([class*="page"])',
          '.team-member-name',
          '.speaker-name',
          'h1'
        ];
        
        for (const selector of nameSelectors) {
          try {
            const element = await page.$(selector);
            if (element) {
              const text = await element.evaluate(el => el.textContent?.trim() || '');
              // Skip generic headings like "Speakers", "Team", etc.
              if (text && !text.match(/^(Speakers?|Team|About|Home|Page)$/i) && text.length > 2) {
                name = text;
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
        
        // If still no name, try extracting from URL
        if (!name || name === 'Speakers') {
          const urlMatch = link.match(/\/teams\/([^\/]+)/);
          if (urlMatch) {
            const slug = urlMatch[1];
            // Convert slug to name (e.g., "juan-pablo-salazar" -> "Juan Pablo Salazar")
            name = slug
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
          }
        }
      } catch (err) {
        console.log(`   ⚠️  Error extracting name: ${err.message}`);
      }
      
      if (!name) {
        console.log(`   ⏭️  Skipping - no name found`);
        skipped++;
        continue;
      }

      console.log(`   👤 Name: ${name}`);

      // Extract image
      const img = await page.$('img.wp-post-image, img[fetchpriority]');
      let src = img ? await img.evaluate(el => el.getAttribute('src')) : null;
      let srcset = img ? await img.evaluate(el => el.getAttribute('srcset')) : null;
      let originalUrl = src;
      
      // Pick largest from srcset if available
      if (srcset) {
        const candidates = srcset.split(',').map(s => s.trim().split(' ')).filter(x => x.length >= 2);
        candidates.sort((a, b) => parseInt(b[1]) - parseInt(a[1]));
        if (candidates.length > 0) originalUrl = candidates[0][0];
      }

      if (!originalUrl) {
        console.log(`   ⏭️  Skipping - no image found`);
        skipped++;
        continue;
      }

      console.log(`   🖼️  Image URL: ${originalUrl}`);

      // Check if speaker exists in database
      const existingSpeaker = await findSpeakerByName(name);
      const isNewSpeaker = !existingSpeaker;
      
      if (isNewSpeaker) {
        console.log(`   ✨ NEW SPEAKER - will be added to database`);
      } else {
        console.log(`   ✅ Found in DB: ${existingSpeaker.name} (${existingSpeaker.id})`);
      }

      // Generate S3 key
      const filename = speakerNameToFilename(name);
      const s3Key = `${SPEAKER_AVATARS_PREFIX}foto-${filename}.png`;
      const s3Url = getS3AvatarUrl(name);

      console.log(`   📦 S3 Key: ${s3Key}`);

      // Check if already in S3
      let existsInS3 = false;
      try {
        existsInS3 = await fileExistsInS3(s3Key);
      } catch (s3CheckError) {
        console.log(`   ⚠️  Error checking S3: ${s3CheckError.message}`);
      }

      let finalS3Url = s3Url;

      if (!existsInS3) {
        // Download image
        console.log(`   📥 Downloading image...`);
        let imageBuffer;
        try {
          const res = await fetch(originalUrl);
          if (res.status === 200) {
            imageBuffer = await res.buffer();
            downloaded++;
            console.log(`   ✅ Downloaded (${(imageBuffer.length / 1024).toFixed(2)} KB)`);
          } else {
            console.error(`   ❌ HTTP ${res.status} - ${originalUrl}`);
            failed++;
            continue;
          }
        } catch (err) {
          console.error(`   ❌ Failed to download: ${err.message}`);
          failed++;
          continue;
        }

        // Upload to S3
        console.log(`   📤 Uploading to S3...`);
        const uploadResult = await uploadToS3(imageBuffer, s3Key, 'image/png');

        if (uploadResult.success) {
          finalS3Url = uploadResult.url;
          uploaded++;
          console.log(`   ✅ Uploaded to S3: ${finalS3Url}`);
        } else {
          console.error(`   ❌ Failed to upload: ${uploadResult.error}`);
          failed++;
          continue;
        }
      } else {
        console.log(`   ✅ Already in S3`);
      }

      // Extract additional info for new speakers
      let title = '';
      let bio = '';
      let company = '';
      
      if (isNewSpeaker) {
        try {
          // Try to extract title
          const titleElement = await page.$('.team-member-title, .speaker-title, .title');
          if (titleElement) {
            title = await titleElement.evaluate(el => el.textContent?.trim() || '');
          }
          
          // Try to extract bio
          const bioElement = await page.$('.team-member-bio, .speaker-bio, .bio, p');
          if (bioElement) {
            bio = await bioElement.evaluate(el => el.textContent?.trim() || '');
          }
          
          company = extractCompanyFromTitle(title) || '';
        } catch (err) {
          console.log(`   ⚠️  Could not extract additional info: ${err.message}`);
        }
      }

      // Update or insert speaker in database
      if (isNewSpeaker) {
        // Generate UUID for new speaker
        const slug = speakerNameToFilename(name);
        const speakerId = await generateUUIDv5(slug);
        
        const speakerData = {
          id: speakerId,
          name: name,
          title: title || null,
          company: company || null,
          bio: bio || (title ? `${title}${company ? ` at ${company}` : ''}` : `Speaker at Blockchain Summit LA`),
          imageurl: finalS3Url,
          tags: ['Blockchain', 'FinTech', 'Innovation'],
          availability: {
            monday: { start: '09:00', end: '17:00' },
            tuesday: { start: '09:00', end: '17:00' },
            wednesday: { start: '09:00', end: '17:00' },
            thursday: { start: '09:00', end: '17:00' },
            friday: { start: '09:00', end: '17:00' }
          },
          linkedin: `https://linkedin.com/in/${slug}`,
          twitter: null,
          user_id: null
        };

        const { error: insertError } = await supabase
          .from('bsl_speakers')
          .insert(speakerData);

        if (insertError) {
          console.error(`   ❌ Failed to add speaker: ${insertError.message}`);
          failed++;
        } else {
          console.log(`   ✅ Added new speaker to database`);
          added++;
        }
      } else {
        // Update existing speaker with S3 URL
        const { error: updateError } = await supabase
          .from('bsl_speakers')
          .update({ 
            imageurl: finalS3Url
          })
          .eq('id', existingSpeaker.id);

        if (updateError) {
          console.error(`   ⚠️  Failed to update DB: ${updateError.message}`);
        } else {
          console.log(`   ✅ Updated DB with S3 URL`);
          updated++;
        }
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (err) {
      console.error(`❌ Error processing ${link}:`, err.message);
      failed++;
    }
  }

  await browser.close();

  console.log('\n📊 Summary:');
  console.log(`   Downloaded: ${downloaded}`);
  console.log(`   Uploaded to S3: ${uploaded}`);
  console.log(`   Added to DB: ${added}`);
  console.log(`   Updated in DB: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed: ${failed}`);
  console.log(`\n✅ Process completed!`);
}

scrapeAndProcessSpeakers().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

