#!/usr/bin/env node
import {mkdir, readFile, stat} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const source = path.join(root, 'src/content/lukas-why-narration.json');
const output = path.join(root, 'public/audio/narration/lukas-why');

function run(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8', stdio: 'inherit', shell: false});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function probe(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`Could not inspect ${file}`);
  return Number(result.stdout.trim());
}

const narration = JSON.parse(await readFile(source, 'utf8'));
const locales = Object.keys(narration);
const available = spawnSync('edge-tts', ['--list-voices'], {stdio: 'ignore'});
if (available.error || available.status !== 0) {
  throw new Error('edge-tts is required. Install the pinned tool with: pip install edge-tts==7.3.1');
}
const version = spawnSync('edge-tts', ['--version'], {encoding: 'utf8'});
if (version.status !== 0 || !/edge-tts 7\.3\./.test(version.stdout)) {
  throw new Error('Lukas narration requires edge-tts 7.3.x. Install with: pip install edge-tts==7.3.1');
}

await mkdir(output, {recursive: true});
for (const locale of locales) {
  const line = narration[locale];
  const target = path.join(output, `${locale}.mp3`);
  console.log(`[${locale}] ${line.voice}: ${line.text}`);
  run('edge-tts', [
    '--voice', line.voice,
    `--rate=${line.rate}`,
    '--text', line.text,
    '--write-media', target,
  ]);
  const file = await stat(target);
  const seconds = probe(target);
  if (file.size === 0 || !Number.isFinite(seconds) || seconds <= 0 || seconds > 11.4) {
    throw new Error(`${locale} narration is invalid or too long (${seconds}s)`);
  }
  console.log(`[${locale}] ${seconds.toFixed(2)}s, ${file.size} bytes`);
}
console.log(`Generated ${locales.length} localized Lukas narration tracks in ${output}`);
