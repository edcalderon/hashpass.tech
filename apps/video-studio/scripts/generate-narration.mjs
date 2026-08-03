#!/usr/bin/env node
// Synthesizes EN/ES narration audio for the narrated AppTutorial variant via
// edge-tts (Microsoft Edge's free neural TTS — no API key, uses the same
// public service Edge's "Read aloud" feature calls). Source text lives in
// src/content/narration.json so this script and the Remotion composition
// share one source of truth.
//
// Usage: pnpm --filter hashpass-video-studio narration:generate
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const NARRATION_JSON = join(ROOT, 'src/content/narration.json');
const OUT_DIR = join(ROOT, 'public/audio/narration');

// Voices picked for a warm, professional product-demo tone; es-ES to match
// the --locale es-ES used when recording the Spanish app footage.
const VOICES = {
  en: 'en-US-AriaNeural',
  es: 'es-ES-ElviraNeural',
};

function main() {
  if (!existsSync(NARRATION_JSON)) {
    console.error(`Missing ${NARRATION_JSON}`);
    process.exit(1);
  }

  const check = spawnSync('edge-tts', ['--list-voices'], {stdio: 'ignore'});
  if (check.error || check.status !== 0) {
    console.error('edge-tts is not available on PATH. Install with: pip install edge-tts');
    process.exit(1);
  }

  const narration = JSON.parse(readFileSync(NARRATION_JSON, 'utf8'));

  for (const [lang, voice] of Object.entries(VOICES)) {
    const lines = narration[lang];
    if (!lines) continue;

    const langDir = join(OUT_DIR, lang);
    mkdirSync(langDir, {recursive: true});

    for (const {slug, text} of lines) {
      const outPath = join(langDir, `${slug}.mp3`);
      console.log(`[${lang}] ${slug}: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`);

      const result = spawnSync(
        'edge-tts',
        ['--voice', voice, '--text', text, '--write-media', outPath],
        {stdio: 'inherit'},
      );

      if (result.status !== 0) {
        console.error(`Failed to synthesize ${lang}/${slug}`);
        process.exit(result.status ?? 1);
      }
    }
  }

  console.log(`\nNarration audio written to ${OUT_DIR}`);
}

main();
