#!/usr/bin/env node

import puppeteer from "puppeteer";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

// Supabase (optional DB update)
let supabase;
try {
  const { createClient } = await import("@supabase/supabase-js");
  if (process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
} catch {}

// Speaker avatars bucket - uses EXPO_PUBLIC_AWS_S3_BUCKET (hashpass-assets)
const BUCKET = process.env.EXPO_PUBLIC_AWS_S3_BUCKET || process.env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || 'hashpass-assets';
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const s3Client = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const OUTPUT_JSON = path.resolve("scraped-speakers-to-s3.json");
const UPLOAD_PREFIX = "speakers/avatars/";

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function uploadToS3(buffer, filename, contentType = "image/png") {
  const s3Key = `${UPLOAD_PREFIX}${filename}`;
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    });
    await s3Client.send(command);
    return `https://${BUCKET}.s3.${AWS_REGION}.amazonaws.com/${s3Key}`;
  } catch (error) {
    console.error(`❌ S3 upload failed for ${filename}: `, error.message);
    return null;
  }
}

async function scrapeSpeakers() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log('🌐 Scraping main speakers page...');
  await page.goto('https://blockchainsummit.la/', { waitUntil: 'networkidle2', timeout: 60000 });
  // Find all speaker links - adjust selector if speakers URL path is stable
  const speakerLinks = await page.$$eval('a[href*="/teams/"]', links =>
    Array.from(new Set(links.map(l => l.href.split("?")[0])))
  );
  console.log(`🔍 Found ${speakerLinks.length} speaker profiles.`);
  const summary = [];
  // For each speaker page:
  for (let link of speakerLinks) {
    try {
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 30000 });
      const name = await page.$eval('h1, .team-member-name, .speaker-name', el => el.textContent?.trim() || '')
        .catch(()=>"");
      const img = await page.$('img.wp-post-image, img[fetchpriority]');
      let src = img ? await img.evaluate(el => el.getAttribute('src')) : null;
      let srcset = img ? await img.evaluate(el => el.getAttribute('srcset')) : null;
      let originalUrl = src;
      // Pick largest from srcset if available
      if (srcset) {
        const candidates = srcset.split(',').map(s => s.trim().split(' ')).filter(x => x.length >= 2);
        // sort descending by width value
        candidates.sort((a, b) => parseInt(b[1]) - parseInt(a[1]));
        if (candidates.length > 0) originalUrl = candidates[0][0];
      }
      if (!name || !originalUrl) {
        console.warn(`⚠️  Skipping, missing data for link ${link}`);
        continue;
      }
      // Download image (buffer)
      console.log(`⬇️  Downloading image for ${name}`);
      let imageBuf = null;
      try {
        const res = await fetch(originalUrl);
        if (res.status === 200) {
          imageBuf = await res.buffer();
        } else { console.warn(`⚠️  HTTP ${res.status} - ${originalUrl}`); }
      } catch (err) {
        console.warn("⚠️  Failed to fetch image:", err.message);
      }
      if (!imageBuf) continue;
      // Upload to S3
      const filename = `foto-${sanitizeFilename(name)}.png`;
      console.log(`⬆️  Uploading ${filename} → S3...`);
      const s3Url = await uploadToS3(imageBuf, filename, 'image/png');
      if (!s3Url) continue;
      summary.push({
        name,
        page_url: link,
        image_original_url: originalUrl,
        image_s3_url: s3Url
      });
      // Update Supabase DB
      if (supabase) {
        try {
          const { error } = await supabase
            .from('bsl_speakers')
            .update({ imageurl: s3Url })
            .ilike('name', name);
          if (error) {
            console.warn(`⚠️  Supabase update error for ${name}: ${error.message}`);
          } else {
            console.log(`✅ DB updated for ${name}`);
          }
        } catch (dbErr) {
          console.warn("⚠️  DB update error:", dbErr.message);
        }
      }
    } catch (err) {
      console.warn(`❌ Failed on ${link}:`, err.message);
    }
  }
  await browser.close();
  // Save summary to disk
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(summary, null, 2));
  console.log(`📦 Saved mapping JSON to ${OUTPUT_JSON}`);
}

scrapeSpeakers().then(()=>{
  console.log('✅ All done');
}).catch(e=>{
  console.error('❌ Fatal:', e);
  process.exit(1);
});
