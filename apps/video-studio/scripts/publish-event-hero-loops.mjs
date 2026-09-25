#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHeroPublishPlan, validateEventHeroManifest} from './lib/event-hero-pipeline.mjs';

const EXPECTED_EVENT_MEDIA_BUCKET = 'hashpass-production-event-media-952191196420-us-east-2';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultStudio = path.resolve(scriptDirectory, '..');

function usage() {
  return 'Usage: node scripts/publish-event-hero-loops.mjs [--studio <video-studio-directory>] [--output <directory>] [--publish]';
}

function parseArgs(args) {
  const values = {studio: defaultStudio, output: '', publish: false};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--studio') values.studio = args[++index] ?? '';
    else if (arg === '--output') values.output = args[++index] ?? '';
    else if (arg === '--publish') values.publish = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!values.studio) throw new Error(usage());
  const studio = path.resolve(values.studio);
  return {studio, output: path.resolve(values.output || path.join(studio, 'out', 'event-heroes')), publish: values.publish};
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const {studio, output, publish} = parseArgs(process.argv.slice(2));
  const bucket = requiredEnvironment('EVENT_MEDIA_BUCKET');
  const region = requiredEnvironment('EVENT_MEDIA_REGION');
  const mediaBaseUrl = requiredEnvironment('EVENT_MEDIA_PUBLIC_BASE_URL');
  if (bucket !== EXPECTED_EVENT_MEDIA_BUCKET) {
    throw new Error('EVENT_MEDIA_BUCKET does not match the approved HASHPASS event-media bucket.');
  }

  const manifest = JSON.parse(await readFile(path.join(studio, 'src', 'content', 'event-hero-specs.json'), 'utf8'));
  const heroes = validateEventHeroManifest(manifest);
  const plan = createHeroPublishPlan(heroes, {mediaBaseUrl, outputDirectory: output});
  await Promise.all(plan.map((entry) => access(entry.localPath)));

  if (!publish) {
    console.log('Dry run only. Re-run with --publish after reviewing these URLs:');
    for (const entry of plan) console.log(`${entry.eventId}: ${entry.publicUrl}`);
    return;
  }

  for (const entry of plan) {
    const result = spawnSync('aws', [
      's3', 'cp', entry.localPath, `s3://${bucket}/${entry.objectKey}`,
      '--region', region,
      '--content-type', 'video/mp4',
      '--cache-control', 'public,max-age=31536000,immutable',
      '--only-show-errors',
    ], {stdio: 'inherit', shell: false});
    if (result.status !== 0) process.exit(result.status ?? 1);
  }

  console.log(`Published ${plan.length} immutable event hero loop(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
