#!/usr/bin/env node
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateEventHeroManifest} from './lib/event-hero-pipeline.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultStudio = path.resolve(scriptDirectory, '..');

function usage() {
  return 'Usage: node scripts/prepare-event-hero-assets.mjs [--studio <video-studio-directory>]';
}

function parseArgs(args) {
  let studio = defaultStudio;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--studio') studio = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!studio) throw new Error(usage());
  return path.resolve(studio);
}

function pathWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

async function downloadLogo(url, destination) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download approved event logo (${response.status}).`);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Approved event logo must be served as an image.');
  }

  const contentLength = Number(response.headers.get('content-length') || '0');
  if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024) {
    throw new Error('Approved event logo exceeds the 5 MB preparation limit.');
  }

  const content = Buffer.from(await response.arrayBuffer());
  if (content.byteLength > 5 * 1024 * 1024) {
    throw new Error('Approved event logo exceeds the 5 MB preparation limit.');
  }
  await writeFile(destination, content);
}

async function main() {
  const studio = parseArgs(process.argv.slice(2));
  const projectRoot = path.resolve(studio, '../..');
  const manifest = JSON.parse(await readFile(path.join(studio, 'src', 'content', 'event-hero-specs.json'), 'utf8'));
  const heroes = validateEventHeroManifest(manifest);

  for (const hero of heroes) {
    const source = hero.eventLogo.source;
    if (typeof source !== 'string' || !source.trim()) {
      throw new Error(`Event hero ${hero.id} needs an eventLogo.source.`);
    }

    const destination = path.resolve(studio, 'public', hero.eventLogo.target);
    const publicDirectory = path.resolve(studio, 'public');
    if (!pathWithin(publicDirectory, destination)) {
      throw new Error(`Event hero ${hero.id} logo target must stay in public/.`);
    }

    await mkdir(path.dirname(destination), {recursive: true});
    if (/^https:\/\//i.test(source)) {
      await downloadLogo(source, destination);
    } else {
      const localSource = path.resolve(studio, source);
      if (!pathWithin(projectRoot, localSource)) {
        throw new Error(`Event hero ${hero.id} logo source must stay in the repository.`);
      }
      await copyFile(localSource, destination);
    }
  }

  console.log(`Prepared ${heroes.length} reviewed event logo asset(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
