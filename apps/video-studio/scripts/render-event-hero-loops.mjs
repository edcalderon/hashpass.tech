#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateEventHeroManifest} from './lib/event-hero-pipeline.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultStudio = path.resolve(scriptDirectory, '..');

function usage() {
  return 'Usage: node scripts/render-event-hero-loops.mjs [--studio <video-studio-directory>] [--output <directory>]';
}

function parseArgs(args) {
  const values = {studio: defaultStudio, output: ''};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--studio') values.studio = args[++index] ?? '';
    else if (arg === '--output') values.output = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!values.studio) throw new Error(usage());
  const studio = path.resolve(values.studio);
  return {studio, output: path.resolve(values.output || path.join(studio, 'out', 'event-heroes'))};
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {stdio: 'inherit', shell: false, ...options});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main() {
  const {studio, output} = parseArgs(process.argv.slice(2));
  run(process.execPath, [path.join(studio, 'scripts', 'prepare-event-hero-assets.mjs'), '--studio', studio]);

  const manifest = JSON.parse(await readFile(path.join(studio, 'src', 'content', 'event-hero-specs.json'), 'utf8'));
  const heroes = validateEventHeroManifest(manifest);
  for (const hero of heroes) {
    const destination = path.join(output, hero.id, 'hashpass-event-hero-v1.mp4');
    await mkdir(path.dirname(destination), {recursive: true});
    console.log(`Rendering ${hero.id} hero loop...`);
    run('npx', ['remotion', 'render', 'src/index.ts', hero.compositionId, destination], {cwd: studio});
  }
  console.log(`Rendered ${heroes.length} event hero loop(s) to ${output}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
