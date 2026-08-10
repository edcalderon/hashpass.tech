#!/usr/bin/env node
// Synthesizes per-scene EN narration audio for the OpenProof composition via
// edge-tts (Microsoft Edge's free neural TTS — no API key), same tool and
// voice as scripts/generate-narration.mjs uses for AppTutorialNarrated.
//
// Source of truth is public/openproof/captions.srt (already checked in,
// authored so each cue's [start,end) matches one scene in
// src/compositions/OpenProof.tsx exactly) rather than a second copy of the
// text — one file, both the on-screen subtitles and the narration script
// read from it.
//
// Usage: pnpm --filter hashpass-video-studio openproof:narration
import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRT_PATH = join(ROOT, 'public/openproof/captions.srt');
const OUT_DIR = join(ROOT, 'public/openproof/narration/en');

// Same voice as AppTutorialNarrated's English track, for a consistent brand voice.
const VOICE = 'en-US-AriaNeural';

function parseSrt(content) {
  const blocks = content.trim().split(/\r?\n\r?\n/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timeLine = lines.find((l) => l.includes('-->'));
    if (!timeLine) continue;
    const textLines = lines.slice(lines.indexOf(timeLine) + 1);
    cues.push(textLines.join(' ').trim());
  }
  return cues;
}

function main() {
  if (!existsSync(SRT_PATH)) {
    console.error(`Missing ${SRT_PATH}`);
    process.exit(1);
  }

  const check = spawnSync('edge-tts', ['--list-voices'], {stdio: 'ignore'});
  if (check.error || check.status !== 0) {
    console.error('edge-tts is not available on PATH. Install with: pip install edge-tts');
    process.exit(1);
  }

  const cues = parseSrt(readFileSync(SRT_PATH, 'utf8'));
  mkdirSync(OUT_DIR, {recursive: true});

  cues.forEach((text, i) => {
    const slug = String(i + 1).padStart(2, '0');
    const outPath = join(OUT_DIR, `${slug}.mp3`);
    console.log(`[${slug}] "${text.slice(0, 70)}${text.length > 70 ? '...' : ''}"`);

    const result = spawnSync(
      'edge-tts',
      ['--voice', VOICE, '--text', text, '--write-media', outPath],
      {stdio: 'inherit'},
    );

    if (result.status !== 0) {
      console.error(`Failed to synthesize scene ${slug}`);
      process.exit(result.status ?? 1);
    }
  });

  console.log(`\nNarration audio written to ${OUT_DIR}`);
}

main();
