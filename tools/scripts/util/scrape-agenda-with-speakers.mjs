#!/usr/bin/env node
/**
 * Scrape BSL 2025 agenda from blockchainsummit.la and extract speaker information
 * This script detects changes in the agenda and updates the database with speaker data
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase environment variables:');
  console.error('- EXPO_PUBLIC_SUPABASE_URL:', !!supabaseUrl);
  console.error('- SUPABASE_SERVICE_ROLE_KEY:', !!serviceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const OUTPUT_DIR = path.resolve(__dirname, 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'scraped-agenda-with-speakers.json');
// Also check parent directory for existing scraped agenda
const EXISTING_AGENDA_FILE = path.resolve(__dirname, '..', '..', 'output', 'scraped-agenda.json');

// Website URL
const WEBSITE_URL = 'https://blockchainsummit.la/';

/**
 * Fetch HTML from URL
 */
function fetchHTML(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      timeout: 30000
    }, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).toString();
        res.resume();
        fetchHTML(redirectUrl).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        res.resume();
        return;
      }

      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Extract text content from HTML element (simple regex-based)
 */
function extractText(html, startTag, endTag) {
  const startIdx = html.indexOf(startTag);
  if (startIdx === -1) return null;
  
  const contentStart = startIdx + startTag.length;
  const endIdx = html.indexOf(endTag, contentStart);
  if (endIdx === -1) return null;
  
  return html.substring(contentStart, endIdx).trim();
}

/**
 * Parse agenda items from HTML
 * This function looks for agenda items and extracts speaker information
 */
function parseAgendaFromHTML(html) {
  const agendaItems = [];
  
  // Try to find agenda sections - look for common patterns
  // Pattern 1: Look for time patterns like "09:00 - 09:15" or "09:00 – 09:15"
  const timePattern = /(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/g;
  
  // Split HTML into sections that might contain agenda items
  // Look for common agenda container patterns
  const agendaSections = html.split(/<section|<div[^>]*class="[^"]*agenda|class="[^"]*schedule|class="[^"]*program/i);
  
  let itemId = 1;
  let currentDay = 1;
  
  // Day configurations
  const dayConfigs = [
    {
      name: 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12',
      maxItems: 12
    },
    {
      name: 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13',
      maxItems: 11
    },
    {
      name: 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14',
      maxItems: 10
    }
  ];
  
  // Try to extract agenda items using multiple strategies
  // Strategy 1: Look for structured data or JSON-LD
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/is);
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1]);
      if (jsonLd['@type'] === 'Event' && jsonLd.subEvent) {
        // Process structured event data
        console.log('Found structured data, processing...');
      }
    } catch (e) {
      // Not valid JSON, continue
    }
  }
  
  // Strategy 2: Look for agenda items in HTML structure
  // Common patterns: headings with times, list items, table rows
  const headingPattern = /<h[1-6][^>]*>.*?(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2}).*?<\/h[1-6]>/gi;
  const listItemPattern = /<li[^>]*>.*?(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2}).*?<\/li>/gi;
  const tableRowPattern = /<tr[^>]*>.*?(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2}).*?<\/tr>/gi;
  
  // Collect all potential agenda item matches
  const matches = [];
  let match;
  
  // Search in headings
  while ((match = headingPattern.exec(html)) !== null) {
    matches.push({
      type: 'heading',
      time: `${match[1]} - ${match[2]}`,
      html: match[0],
      index: match.index
    });
  }
  
  // Search in list items
  while ((match = listItemPattern.exec(html)) !== null) {
    matches.push({
      type: 'list',
      time: `${match[1]} - ${match[2]}`,
      html: match[0],
      index: match.index
    });
  }
  
  // Search in table rows
  while ((match = tableRowPattern.exec(html)) !== null) {
    matches.push({
      type: 'table',
      time: `${match[1]} - ${match[2]}`,
      html: match[0],
      index: match.index
    });
  }
  
  // Sort matches by position in HTML
  matches.sort((a, b) => a.index - b.index);
  
  // Process each match to extract full agenda item details
  for (const match of matches) {
    // Extract title - look for text after the time
    let title = '';
    const titleMatch = match.html.match(/>([^<]+(?:Keynote|Panel|Almuerzo|Registro|Clausura|Café)[^<]*)</i);
    if (titleMatch) {
      title = titleMatch[1].trim();
    } else {
      // Try to extract any text content
      const textMatch = match.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const timeIndex = textMatch.indexOf(match.time);
      if (timeIndex !== -1) {
        title = textMatch.substring(timeIndex + match.time.length).trim();
        // Clean up title
        title = title.replace(/^[–\-:\s]+/, '').trim();
      }
    }
    
    if (!title || title.length < 5) continue;
    
    // Determine type
    let type = 'keynote';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('panel')) {
      type = 'panel';
    } else if (titleLower.includes('almuerzo') || titleLower.includes('lunch')) {
      type = 'meal';
    } else if (titleLower.includes('registro') || titleLower.includes('registration')) {
      type = 'registration';
    } else if (titleLower.includes('café') || titleLower.includes('coffee')) {
      type = 'meal';
    } else if (titleLower.includes('clausura') || titleLower.includes('closing')) {
      type = 'keynote';
    }
    
    // Extract speakers - look for speaker names in the HTML around this item
    const speakers = extractSpeakers(match.html, html, match.index);
    
    // Determine day based on item count
    let day = dayConfigs[0].name;
    if (itemId > dayConfigs[0].maxItems) {
      day = dayConfigs[1].name;
    }
    if (itemId > dayConfigs[0].maxItems + dayConfigs[1].maxItems) {
      day = dayConfigs[2].name;
    }
    
    agendaItems.push({
      id: `agenda-${itemId}`,
      event_id: 'bsl2025',
      day: day,
      time: match.time,
      title: title,
      description: null,
      speakers: speakers.length > 0 ? speakers : null,
      type: type,
      location: 'Universidad EAFIT, Medellín',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    
    itemId++;
  }
  
  // If we didn't find enough items, try fallback parsing
  if (agendaItems.length < 10) {
    console.warn('⚠️  Found fewer items than expected, trying fallback parsing...');
    const fallbackItems = parseAgendaFallback(html);
    if (fallbackItems.length > agendaItems.length) {
      return fallbackItems;
    }
  }
  
  // If still no items, load from existing scraped file
  if (agendaItems.length === 0) {
    console.warn('⚠️  No items found, loading from existing scraped-agenda.json...');
    const existingFile = path.join(OUTPUT_DIR, 'scraped-agenda.json');
    if (fs.existsSync(existingFile)) {
      try {
        const existingData = JSON.parse(fs.readFileSync(existingFile, 'utf-8'));
        if (Array.isArray(existingData) && existingData.length > 0) {
          console.log(`✅ Loaded ${existingData.length} items from existing file`);
          return existingData;
        }
      } catch (e) {
        console.error('❌ Error loading existing file:', e.message);
      }
    }
  }
  
  return agendaItems;
}

/**
 * Extract speaker names from HTML
 * Looks for speaker names in various formats
 */
function extractSpeakers(itemHTML, fullHTML, itemIndex) {
  const speakers = [];
  
  // Strategy 1: Look for speaker names in the item HTML itself
  // Common patterns: "Speaker: Name", "By: Name", speaker name tags
  const speakerPatterns = [
    /speaker[s]?[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /by[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /presented by[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /<span[^>]*class="[^"]*speaker[^"]*"[^>]*>([^<]+)<\/span>/gi,
    /<div[^>]*class="[^"]*speaker[^"]*"[^>]*>([^<]+)<\/div>/gi,
    /<p[^>]*class="[^"]*speaker[^"]*"[^>]*>([^<]+)<\/p>/gi,
    /<h[1-6][^>]*class="[^"]*speaker[^"]*"[^>]*>([^<]+)<\/h[1-6]>/gi,
  ];
  
  for (const pattern of speakerPatterns) {
    let match;
    while ((match = pattern.exec(itemHTML)) !== null) {
      const name = match[1].trim();
      // Clean up HTML entities and extra whitespace
      const cleanName = name.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (cleanName.length > 2 && !speakers.includes(cleanName)) {
        speakers.push(cleanName);
      }
    }
  }
  
  // Strategy 2: Look in surrounding HTML context (3000 chars before and after)
  const contextStart = Math.max(0, itemIndex - 3000);
  const contextEnd = Math.min(fullHTML.length, itemIndex + itemHTML.length + 3000);
  const context = fullHTML.substring(contextStart, contextEnd);
  
  // Strategy 3: Look for speaker list structures (ul, ol, div lists)
  const speakerListPatterns = [
    /<ul[^>]*class="[^"]*speaker[^"]*"[^>]*>(.*?)<\/ul>/is,
    /<div[^>]*class="[^"]*speaker[s]?[^"]*"[^>]*>(.*?)<\/div>/is,
    /<section[^>]*class="[^"]*speaker[s]?[^"]*"[^>]*>(.*?)<\/section>/is,
  ];
  
  for (const listPattern of speakerListPatterns) {
    const listMatch = context.match(listPattern);
    if (listMatch) {
      const listHTML = listMatch[1];
      // Extract names from list items
      const nameMatches = listHTML.matchAll(/<li[^>]*>([^<]+)<\/li>/gi);
      for (const nameMatch of nameMatches) {
        const name = nameMatch[1].trim().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        if (name.length > 2 && !speakers.includes(name)) {
          speakers.push(name);
        }
      }
      
      // Also try extracting from divs/spans within the speaker section
      const divMatches = listHTML.matchAll(/<div[^>]*>([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)<\/div>/g);
      for (const divMatch of divMatches) {
        const name = divMatch[1].trim();
        if (name.length > 2 && !speakers.includes(name)) {
          speakers.push(name);
        }
      }
    }
  }
  
  // Strategy 4: Look for data attributes with speaker info
  const dataSpeakerPattern = /data-speaker="([^"]+)"/gi;
  let dataMatch;
  while ((dataMatch = dataSpeakerPattern.exec(context)) !== null) {
    const name = dataMatch[1].trim();
    if (name.length > 2 && !speakers.includes(name)) {
      speakers.push(name);
    }
  }
  
  return speakers;
}

/**
 * Fallback parsing method using known agenda structure
 */
function parseAgendaFallback(html) {
  console.log('Using fallback parsing method...');
  
  // This is a simplified version that uses known patterns
  // You can enhance this based on the actual website structure
  
  const agendaItems = [];
  const timePattern = /(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/g;
  
  let match;
  let itemId = 1;
  
  while ((match = timePattern.exec(html)) !== null && itemId <= 33) {
    const time = `${match[1]} - ${match[2]}`;
    
    // Extract surrounding text
    const startIdx = Math.max(0, match.index - 200);
    const endIdx = Math.min(html.length, match.index + 500);
    const context = html.substring(startIdx, endIdx);
    
    // Try to extract title
    const titleMatch = context.match(/(?:Keynote|Panel|Almuerzo|Registro|Clausura)[^<]*/i);
    const title = titleMatch ? titleMatch[0].trim() : `Agenda Item ${itemId}`;
    
    // Determine day
    let day = 'Día 1 - Regulación, Bancos Centrales e Infraestructura del Dinero Digital 2025-11-12';
    if (itemId > 12) {
      day = 'Día 2 - PSAV, Compliance, Custodia y Tokenización 2025-11-13';
    }
    if (itemId > 24) {
      day = 'Día 3 - Stablecoins y DeFi: Integrando el Mundo Financiero Global 2025-11-14';
    }
    
    // Determine type
    let type = 'keynote';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('panel')) {
      type = 'panel';
    } else if (titleLower.includes('almuerzo')) {
      type = 'meal';
    } else if (titleLower.includes('registro')) {
      type = 'registration';
    }
    
    agendaItems.push({
      id: `agenda-${itemId}`,
      event_id: 'bsl2025',
      day: day,
      time: time,
      title: title,
      description: null,
      speakers: null, // Will be populated by matching with bsl_speakers
      type: type,
      location: 'Universidad EAFIT, Medellín',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    
    itemId++;
  }
  
  return agendaItems;
}

/**
 * Match speakers from agenda items with bsl_speakers table
 * Returns speaker NAMES (not IDs) to match UI expectations
 */
async function matchSpeakersWithDatabase(agendaItems) {
  console.log('🔍 Matching speakers with database...');
  
  // Fetch all speakers from database
  const { data: speakers, error } = await supabase
    .from('bsl_speakers')
    .select('id, name');
  
  if (error) {
    console.error('❌ Error fetching speakers:', error);
    return agendaItems;
  }
  
  if (!speakers || speakers.length === 0) {
    console.warn('⚠️  No speakers found in database');
    return agendaItems;
  }
  
  console.log(`✅ Found ${speakers.length} speakers in database`);
  
  // Create maps for matching
  // Map 1: normalized name -> full name (for exact matches)
  const normalizedToName = new Map();
  // Map 2: normalized name -> full name (for partial matches)
  const partialMatchMap = new Map();
  
  speakers.forEach(speaker => {
    const fullName = speaker.name;
    // Normalize name: lowercase, remove accents, etc.
    const normalized = fullName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    normalizedToName.set(normalized, fullName);
    
    // Also add variations for partial matching
    const parts = fullName.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
      // Add "First Last" format
      const firstLast = `${parts[0]} ${parts[parts.length - 1]}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      partialMatchMap.set(firstLast, fullName);
      
      // Add first name only (for common names)
      if (parts[0].length > 3) {
        partialMatchMap.set(parts[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), fullName);
      }
    }
  });
  
  // Match speakers in agenda items
  let matchedCount = 0;
  for (const item of agendaItems) {
    if (!item.title) continue;
    
    const itemSpeakers = new Set(); // Use Set to avoid duplicates
    
    // Normalize title for matching
    const titleLower = item.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Strategy 1: Check for exact speaker name matches in title
    for (const [normalizedName, fullName] of normalizedToName.entries()) {
      if (titleLower.includes(normalizedName)) {
        itemSpeakers.add(fullName);
        matchedCount++;
      }
    }
    
    // Strategy 2: Check for partial matches (first name + last name)
    for (const [partialName, fullName] of partialMatchMap.entries()) {
      if (titleLower.includes(partialName)) {
        itemSpeakers.add(fullName);
        matchedCount++;
      }
    }
    
    // Strategy 3: If speakers were already extracted from HTML, keep them
    if (item.speakers && Array.isArray(item.speakers)) {
      for (const speakerName of item.speakers) {
        // Try to match with database to get full name
        const normalized = speakerName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const matchedName = normalizedToName.get(normalized) || partialMatchMap.get(normalized) || speakerName;
        itemSpeakers.add(matchedName);
      }
    }
    
    // Convert Set to Array and update item
    if (itemSpeakers.size > 0) {
      item.speakers = Array.from(itemSpeakers);
    } else {
      item.speakers = null;
    }
  }
  
  console.log(`✅ Matched ${matchedCount} speaker references`);
  
  // Show summary
  const itemsWithSpeakers = agendaItems.filter(item => item.speakers && item.speakers.length > 0).length;
  console.log(`   Items with speakers: ${itemsWithSpeakers} out of ${agendaItems.length}`);
  
  return agendaItems;
}

/**
 * Generate hash for change detection
 */
function generateAgendaHash(agendaData) {
  const agendaString = JSON.stringify(agendaData.map(item => ({
    time: item.time,
    title: item.title,
    type: item.type,
    speakers: item.speakers
  })));
  return crypto.createHash('md5').update(agendaString).digest('hex');
}

/**
 * Update database with agenda data
 */
async function updateDatabase(agendaData) {
  try {
    console.log('🗑️  Clearing existing agenda...');
    const { error: deleteError } = await supabase
      .from('event_agenda')
      .delete()
      .eq('event_id', 'bsl2025');

    if (deleteError) {
      throw deleteError;
    }
    console.log('✅ Existing agenda cleared');

    console.log('📝 Inserting agenda items...');
    const { data, error } = await supabase
      .from('event_agenda')
      .insert(agendaData);

    if (error) {
      throw error;
    }

    console.log(`✅ Updated database with ${agendaData.length} agenda items`);
    return { success: true, data };
  } catch (error) {
    console.error('❌ Database update failed:', error);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🚀 Starting BSL 2025 agenda scraping with speakers...\n');
    
    // Ensure output directory exists
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    
    // Fetch HTML from website
    console.log(`📡 Fetching agenda from ${WEBSITE_URL}...`);
    const html = await fetchHTML(WEBSITE_URL);
    console.log(`✅ Fetched ${html.length} characters of HTML\n`);
    
    // Parse agenda from HTML
    console.log('🔍 Parsing agenda items...');
    let agendaItems = parseAgendaFromHTML(html);
    console.log(`✅ Parsed ${agendaItems.length} agenda items\n`);
    
    // If no items parsed, load from existing file first
    if (agendaItems.length === 0) {
      console.warn('⚠️  No items parsed from HTML, loading from existing scraped-agenda.json...');
      // Try multiple possible locations
      const possibleFiles = [
        path.join(OUTPUT_DIR, 'scraped-agenda.json'),
        EXISTING_AGENDA_FILE,
        path.resolve(__dirname, '..', 'output', 'scraped-agenda.json')
      ];
      
      for (const existingFile of possibleFiles) {
        if (fs.existsSync(existingFile)) {
          try {
            const existingData = JSON.parse(fs.readFileSync(existingFile, 'utf-8'));
            if (Array.isArray(existingData) && existingData.length > 0) {
              console.log(`✅ Loaded ${existingData.length} items from ${existingFile}`);
              agendaItems = existingData;
              break;
            }
          } catch (e) {
            console.error(`❌ Error loading ${existingFile}:`, e.message);
          }
        }
      }
    }
    
    if (agendaItems.length === 0) {
      console.error('❌ No agenda items found. Cannot proceed.');
      process.exit(1);
    }
    
    // Match speakers with database
    agendaItems = await matchSpeakersWithDatabase(agendaItems);
    
    // Save to file
    console.log(`💾 Saving to ${OUTPUT_FILE}...`);
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(agendaItems, null, 2));
    console.log('✅ Saved to file\n');
    
    // Generate hash for change detection
    const currentHash = generateAgendaHash(agendaItems);
    console.log(`🔐 Current agenda hash: ${currentHash}\n`);
    
    // Check if agenda has changed
    const hashFile = path.join(OUTPUT_DIR, 'agenda-hash.txt');
    let previousHash = null;
    if (fs.existsSync(hashFile)) {
      previousHash = fs.readFileSync(hashFile, 'utf-8').trim();
    }
    
    if (previousHash && previousHash === currentHash) {
      console.log('ℹ️  No changes detected in agenda');
      console.log('   Use --force flag to update database anyway\n');
      return;
    }
    
    // Update database
    console.log('📊 Updating database...');
    await updateDatabase(agendaItems);
    
    // Save hash
    fs.writeFileSync(hashFile, currentHash);
    console.log('✅ Hash saved\n');
    
    // Summary
    console.log('📊 Summary:');
    console.log(`   Total items: ${agendaItems.length}`);
    const itemsWithSpeakers = agendaItems.filter(item => item.speakers && item.speakers.length > 0).length;
    console.log(`   Items with speakers: ${itemsWithSpeakers}`);
    console.log(`   Hash: ${currentHash}`);
    console.log('\n✅ Scraping completed successfully!');
    
  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, parseAgendaFromHTML, matchSpeakersWithDatabase };

