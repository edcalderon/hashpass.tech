#!/usr/bin/env node

// Scrapes speaker images from Blockchain Summit LA team pages and saves JSON
// - Reads speaker names from config/events.ts (BSL2025 speakers array)
// - Builds slugs: /teams/<firstname-lastname>/
// - Fetches the page and extracts the <img class="wp-post-image"> src and srcset
// - Outputs to scripts/output/speaker-images.json

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const ROOT = path.resolve(process.cwd());
const EVENTS_TS = path.join(ROOT, 'config', 'events.ts');
const OUTPUT_DIR = path.join(ROOT, 'scripts', 'output');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'speaker-images.json');
const BASE_URL = 'https://blockchainsummit.la/teams';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpeakerImageScraper/1.0)'
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow simple redirects
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
    req.end();
  });
}

function slugifyName(name) {
  // Remove accents/diacritics, lowercase, replace non-alphanum with hyphen, collapse hyphens
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function extractSpeakersSection(tsContent) {
  // Find the first occurrence of 'speakers: [' and extract the array block
  const startIdx = tsContent.indexOf('speakers: [');
  if (startIdx === -1) return '';
  let i = startIdx + 'speakers: ['.length;
  let depth = 1; // already inside [
  while (i < tsContent.length) {
    const ch = tsContent[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth--;
    if (depth === 0) {
      // slice from after 'speakers: ' to here
      return tsContent.slice(startIdx, i + 1);
    }
    i++;
  }
  return '';
}

function extractSpeakerNamesFromSection(section) {
  // Match name: '...'
  const names = [];
  const nameRegex = /name:\s*'([^']+)'/g;
  let m;
  while ((m = nameRegex.exec(section)) !== null) {
    names.push(m[1]);
  }
  // De-duplicate, preserve order
  return Array.from(new Set(names));
}

function parseImageTag(html) {
  // Find first wp-post-image
  const imgTagMatch = html.match(/<img[^>]*class=["'][^"']*wp-post-image[^"']*["'][^>]*>/i);
  if (!imgTagMatch) return null;
  const tag = imgTagMatch[0];
  const srcMatch = tag.match(/\ssrc=["']([^"']+)["']/i);
  const srcsetMatch = tag.match(/\ssrcset=["']([^"']+)["']/i);
  const sizesMatch = tag.match(/\ssizes=["']([^"']+)["']/i);

  const src = srcMatch ? srcMatch[1] : null;
  const srcset = {};
  if (srcsetMatch) {
    const entries = srcsetMatch[1].split(',').map(s => s.trim());
    for (const entry of entries) {
      const [url, size] = entry.split(/\s+/);
      if (url && size) srcset[size] = url;
    }
  }
  return { src, srcset, sizes: sizesMatch ? sizesMatch[1] : null };
}

function pickBestImage({ src, srcset }) {
  if (!src && !srcset) return null;
  // Prefer 1080w, otherwise the largest width available, otherwise src
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

async function main() {
  // Read config/events.ts
  const ts = fs.readFileSync(EVENTS_TS, 'utf8');
  const section = extractSpeakersSection(ts);
  if (!section) {
    console.error('Could not locate speakers section in config/events.ts');
    process.exit(1);
  }
  const names = extractSpeakerNamesFromSection(section);
  if (names.length === 0) {
    console.error('No speaker names found in speakers section.');
    process.exit(1);
  }

  // Ensure output dir
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const name of names) {
    const slug = slugifyName(name);
    const url = `${BASE_URL}/${slug}/`;
    try {
      const html = await httpGet(url);
      const parsed = parseImageTag(html);
      const best = parsed ? pickBestImage(parsed) : null;
      results.push({ name, slug, url, image: best, raw: parsed });
      console.log(`✓ ${name} → ${best || 'not found'}`);
    } catch (err) {
      console.warn(`⚠︎ Failed to fetch ${url}: ${err.message}`);
      results.push({ name, slug, url, image: null, error: err.message });
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nSaved ${results.length} records → ${path.relative(ROOT, OUTPUT_FILE)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


