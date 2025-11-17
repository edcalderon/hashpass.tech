#!/usr/bin/env node
import puppeteer from "puppeteer";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

const OUTDIR = path.resolve('tmp/speaker-avatars');
const OUTJSON = path.resolve('scraped-speakers-local.json');
if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });

function sanitizeFilename(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function scrapeSpeakerAvatars() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  console.log('🌐 Scraping main speakers page...');
  await page.goto('https://blockchainsummit.la/', { waitUntil:'networkidle2', timeout: 60000 });
  const speakerLinks = await page.$$eval('a[href*="/teams/"]', links => Array.from(new Set(links.map(l => l.href.split("?")[0]))));
  console.log(`🔍 Found ${speakerLinks.length} speaker profiles.`);
  const summary = [];
  for (let link of speakerLinks) {
    try {
      await page.goto(link, { waitUntil:'networkidle2', timeout: 30000 });
      const name = await page.$eval('h1, .team-member-name, .speaker-name', el => el.textContent?.trim() || '').catch(()=>"");
      const img = await page.$('img.wp-post-image, img[fetchpriority]');
      let src = img ? await img.evaluate(el => el.getAttribute('src')) : null;
      let srcset = img ? await img.evaluate(el => el.getAttribute('srcset')) : null;
      let imageUrl = src;
      if (srcset) {
        const candidates = srcset.split(',').map(s => s.trim().split(' ')).filter(x=>x.length>=2);
        candidates.sort((a,b)=>parseInt(b[1])-parseInt(a[1]));
        if(candidates.length > 0) imageUrl = candidates[0][0];
      }
      if (!name || !imageUrl) {
        console.warn(`⚠️  Skipping, missing data for ${link}`);
        continue;
      }
      const ext = imageUrl.split('.').pop().split('?')[0];
      const filename = `foto-${sanitizeFilename(name)}.${ext}`;
      const localPath = path.join(OUTDIR, filename);
      if (fs.existsSync(localPath)) {
        console.log(`⏭️  ${name}: already exists, skipping.`);
        summary.push({ name, page_url: link, image_url: imageUrl, local_filepath: localPath });
        continue;
      }
      console.log(`⬇️  Downloading avatar for ${name}`);
      try {
        const res = await fetch(imageUrl);
        if (res.status === 200) {
          const buf = await res.arrayBuffer();
          fs.writeFileSync(localPath, Buffer.from(buf));
          summary.push({ name, page_url: link, image_url: imageUrl, local_filepath: localPath });
          console.log(`✅ Saved: ${filename}`);
        } else {
          console.warn(`❌ HTTP ${res.status} on ${imageUrl}`);
        }
      } catch (e) {
        console.warn(`❌  Failed for ${name}:`, e.message);
      }
    } catch (err) {
      console.warn(`❌ Error in speaker link ${link}:`, err.message);
    }
  }
  await browser.close();
  fs.writeFileSync(OUTJSON, JSON.stringify(summary,null,2));
  console.log(`📦 Saved mapping JSON to ${OUTJSON}`);
}

scrapeSpeakerAvatars().then(()=>console.log('✅ All done')).catch(e=>{console.error('❌ Fatal:',e);process.exit(1)});




















