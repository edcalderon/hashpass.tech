#!/usr/bin/env node
/**
 * Check if missing speakers exist on the website
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

// Speakers to check
const speakersToCheck = [
  'Mónica Ramírez de Arellano',
  'Liliana Vásquez',
  'Camila Santana',
  'Manú Hersch',
  'María Paula Rodríguez',
  'Markus Kluge',
  'Manuel Becker',
  'Jorge Borges',
  'Juan Lalinde',
  'Andrea Jaramillo',
  'Sergio Ramírez',
  'Young Cho',
  'Nick Waytula',
  'Vivian Cruz',
  'Luis Castañeda',
  'Mercedes Bidart',
  'José Martínez',
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
        'User-Agent': 'Mozilla/5.0 (compatible; SpeakerChecker/1.0)'
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

async function checkSpeakerOnWebsite(name) {
  const slug = slugifyName(name);
  const url = `${BASE_URL}/${slug}/`;
  
  try {
    const html = await httpGet(url);
    // Check if page contains speaker name or is a valid speaker page
    const nameLower = name.toLowerCase();
    const htmlLower = html.toLowerCase();
    
    // Check for common speaker page indicators
    const hasSpeakerContent = htmlLower.includes(nameLower) || 
                             html.includes('speaker') || 
                             html.includes('team') ||
                             !html.includes('404') ||
                             !html.includes('not found');
    
    return { found: true, url };
  } catch (error) {
    if (error.message.includes('404') || error.message.includes('404')) {
      return { found: false, url, error: '404 Not Found' };
    }
    return { found: false, url, error: error.message };
  }
}

async function main() {
  console.log('🔍 Checking speakers in database and on website...\n');
  
  // Get all speakers from database
  const { data: dbSpeakers, error } = await supabase
    .from('bsl_speakers')
    .select('name');
  
  if (error) {
    console.error('❌ Error fetching speakers:', error);
    process.exit(1);
  }
  
  const dbSpeakerNames = new Set(dbSpeakers.map(s => s.name.toLowerCase()));
  
  console.log(`📊 Found ${dbSpeakers.length} speakers in database\n`);
  console.log('Checking each speaker:\n');
  
  const results = {
    inDatabase: [],
    missingFromDatabase: [],
    onWebsite: [],
    notOnWebsite: []
  };
  
  for (const speaker of speakersToCheck) {
    const inDb = dbSpeakerNames.has(speaker.toLowerCase());
    const check = await checkSpeakerOnWebsite(speaker);
    
    console.log(`${inDb ? '✓' : '✗'} ${speaker}`);
    console.log(`   Database: ${inDb ? 'YES' : 'NO'}`);
    console.log(`   Website: ${check.found ? 'YES' : 'NO'} ${check.found ? `(${check.url})` : `(${check.error || 'Not found'})`}`);
    console.log('');
    
    if (inDb) {
      results.inDatabase.push(speaker);
    } else {
      results.missingFromDatabase.push(speaker);
    }
    
    if (check.found) {
      results.onWebsite.push({ name: speaker, url: check.url });
    } else {
      results.notOnWebsite.push({ name: speaker, url: check.url, error: check.error });
    }
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 Summary:');
  console.log(`   In database: ${results.inDatabase.length}`);
  console.log(`   Missing from database: ${results.missingFromDatabase.length}`);
  console.log(`   Found on website: ${results.onWebsite.length}`);
  console.log(`   Not found on website: ${results.notOnWebsite.length}\n`);
  
  if (results.missingFromDatabase.length > 0) {
    console.log('❌ Missing from database:');
    results.missingFromDatabase.forEach(name => console.log(`   - ${name}`));
    console.log('');
  }
  
  if (results.notOnWebsite.length > 0) {
    console.log('⚠️  Not found on website:');
    results.notOnWebsite.forEach(({ name, url, error }) => {
      console.log(`   - ${name} (${url}) - ${error || 'Not found'}`);
    });
  }
  
  if (results.onWebsite.length > 0 && results.missingFromDatabase.length > 0) {
    console.log('\n💡 Speakers found on website but missing from database:');
    results.onWebsite.forEach(({ name, url }) => {
      if (results.missingFromDatabase.includes(name)) {
        console.log(`   - ${name} (${url})`);
      }
    });
  }
}

main().catch(console.error);

