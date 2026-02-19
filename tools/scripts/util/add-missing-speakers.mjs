#!/usr/bin/env node
/**
 * Add missing speakers that are on the website but not in database
 */

import https from 'https';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const BASE_URL = 'https://blockchainsummit.la/teams';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

// Missing speakers to add
const missingSpeakers = [
  'Liliana Vásquez',
  'Markus Kluge',
  'Jorge Borges',
  'Juan Lalinde',
  'Andrea Jaramillo',
  'Sergio Ramírez',
  'Marco Suvillaga'
];

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
        'User-Agent': 'Mozilla/5.0 (compatible; SpeakerScraper/1.0)'
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        res.resume();
        httpGet(redirectUrl).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
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
      reject(new Error('Timeout'));
    });
  });
}

function extractSpeakerInfo(html, name) {
  const info = {
    name: name,
    title: null,
    company: null,
    bio: null,
    linkedin: null,
    twitter: null,
    imageUrl: null
  };
  
  // Extract title (usually in h2 or strong tags)
  const titleMatch = html.match(/<h2[^>]*>([^<]+)<\/h2>/i) || 
                    html.match(/<strong[^>]*>([^<]+)<\/strong>/i) ||
                    html.match(/<p[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/p>/i);
  if (titleMatch) {
    info.title = titleMatch[1].trim();
  }
  
  // Extract company
  const companyMatch = html.match(/<p[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)<\/p>/i) ||
                       html.match(/<span[^>]*class="[^"]*company[^"]*"[^>]*>([^<]+)<\/span>/i);
  if (companyMatch) {
    info.company = companyMatch[1].trim();
  }
  
  // Extract bio (usually in a paragraph after the title)
  const bioMatch = html.match(/<p[^>]*>([^<]{50,500})<\/p>/i);
  if (bioMatch) {
    info.bio = bioMatch[1].trim().substring(0, 500);
  }
  
  // Extract LinkedIn
  const linkedinMatch = html.match(/href="([^"]*linkedin\.com[^"]*)"/i);
  if (linkedinMatch) {
    info.linkedin = linkedinMatch[1];
  }
  
  // Extract Twitter
  const twitterMatch = html.match(/href="([^"]*twitter\.com[^"]*)"/i) ||
                       html.match(/href="([^"]*x\.com[^"]*)"/i);
  if (twitterMatch) {
    info.twitter = twitterMatch[1];
  }
  
  // Extract image
  const imageMatch = html.match(/<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"/i) ||
                    html.match(/<img[^>]*src="([^"]*foto-[^"]+\.(?:png|jpg|jpeg))"/i);
  if (imageMatch) {
    info.imageUrl = imageMatch[1].startsWith('http') ? imageMatch[1] : `https://blockchainsummit.la${imageMatch[1]}`;
  } else {
    // Try default image path
    const slug = slugifyName(name);
    info.imageUrl = `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${slug}.png`;
  }
  
  return info;
}

async function addSpeaker(name) {
  const slug = slugifyName(name);
  const url = `${BASE_URL}/${slug}/`;
  
  console.log(`\n📡 Fetching ${name} from ${url}...`);
  
  try {
    const html = await httpGet(url);
    const info = extractSpeakerInfo(html, name);
    
    // Generate UUID v5 from slug (same method as check-and-add-speakers.mjs)
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
    const id = [
      hashBytes.slice(0, 4).toString('hex'),
      hashBytes.slice(4, 6).toString('hex'),
      hashBytes.slice(6, 8).toString('hex'),
      hashBytes.slice(8, 10).toString('hex'),
      hashBytes.slice(10, 16).toString('hex')
    ].join('-');
    
    // Prepare speaker data
    const speakerData = {
      id: id,
      name: info.name,
      title: info.title || null,
      company: info.company || null,
      bio: info.bio || `Speaker at Blockchain Summit Latam 2025.`,
      linkedin: info.linkedin || null,
      twitter: info.twitter || null,
      imageurl: info.imageUrl, // Note: lowercase 'imageurl' in database
      tags: ['blockchain', 'fintech', 'innovation'],
      availability: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Insert into database
    const { data, error } = await supabase
      .from('bsl_speakers')
      .insert(speakerData)
      .select();
    
    if (error) {
      // Check if it's a duplicate key error
      if (error.code === '23505') {
        console.log(`   ⚠️  ${name} already exists in database`);
        return { success: false, reason: 'already_exists' };
      }
      throw error;
    }
    
    console.log(`   ✅ Added ${name}`);
    console.log(`      Title: ${info.title || 'N/A'}`);
    console.log(`      Company: ${info.company || 'N/A'}`);
    console.log(`      Image: ${info.imageUrl ? 'Yes' : 'No'}`);
    
    return { success: true, data };
  } catch (error) {
    console.error(`   ❌ Error adding ${name}:`, error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Adding missing speakers to database...\n');
  console.log(`📋 Found ${missingSpeakers.length} speakers to add\n`);
  
  let added = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const speaker of missingSpeakers) {
    const result = await addSpeaker(speaker);
    
    if (result.success) {
      added++;
    } else if (result.reason === 'already_exists') {
      skipped++;
    } else {
      failed++;
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📊 Summary:');
  console.log(`   ✅ Added: ${added}`);
  console.log(`   ⚠️  Skipped (already exists): ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📋 Total: ${missingSpeakers.length}\n`);
  
  if (added > 0) {
    console.log('✅ Speakers added successfully!');
  }
}

main().catch(console.error);

