#!/usr/bin/env node
// Synthesizes an original background music bed and a transition whoosh SFX
// with ffmpeg's audio synthesis filters (sine oscillators + noise, no
// samples/loops from any external library) — there's no music-generation
// tool available in this environment, and sourcing a real track would mean
// pulling in something with an actual license to clear. This is a simple,
// clearly-original ambient pad (a four-chord progression, softly filtered)
// good enough as a first pass; swap public/audio/music/elegant-bed.mp3 for
// a licensed track later if a richer result is needed.
//
// Usage: pnpm --filter hashpass-video-studio audio:generate
import {spawnSync} from 'node:child_process';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MUSIC_DIR = join(ROOT, 'public/audio/music');
const SFX_DIR = join(ROOT, 'public/audio/sfx');

// A soft, minor-key progression (Am - F - C - G) — a common, unmistakably
// "warm/emotional" pop progression — as simple triads, one octave, low
// volume, low-passed so the sine oscillators read as a pad, not a beep.
const CHORD_SECONDS = 4;
const CHORDS = [
  {name: 'Am', notes: [220.0, 261.63, 329.63]},
  {name: 'F', notes: [174.61, 220.0, 261.63]},
  {name: 'C', notes: [261.63, 329.63, 392.0]},
  {name: 'G', notes: [196.0, 246.94, 293.66]},
];

const TARGET_MUSIC_SECONDS = 100; // covers the longest composition with margin

function run(args) {
  const result = spawnSync('ffmpeg', ['-y', ...args], {stdio: 'inherit'});
  if (result.status !== 0) {
    console.error(`ffmpeg failed: ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

function main() {
  mkdirSync(MUSIC_DIR, {recursive: true});
  mkdirSync(SFX_DIR, {recursive: true});

  const workDir = join(tmpdir(), `video-studio-audio-${Date.now()}`);
  mkdirSync(workDir, {recursive: true});

  console.log('Synthesizing chord pad...');
  const chordFiles = [];
  CHORDS.forEach((chord, i) => {
    const outPath = join(workDir, `chord-${i}.wav`);
    const inputs = chord.notes.map((freq) => `sine=frequency=${freq}:duration=${CHORD_SECONDS}`);
    const args = [];
    inputs.forEach((expr) => {
      args.push('-f', 'lavfi', '-i', `${expr}`);
    });
    const mixInputs = chord.notes.map((_, idx) => `[${idx}]`).join('');
    args.push(
      '-filter_complex',
      `${mixInputs}amix=inputs=${chord.notes.length}:duration=longest,` +
        `afade=t=in:d=0.6,afade=t=out:st=${CHORD_SECONDS - 0.8}:d=0.8,` +
        `lowpass=f=2200,volume=0.5`,
      '-ar',
      '44100',
      outPath,
    );
    run(args);
    chordFiles.push(outPath);
  });

  console.log('Concatenating progression...');
  const concatListPath = join(workDir, 'concat.txt');
  writeFileSync(concatListPath, chordFiles.map((f) => `file '${f}'`).join('\n'));
  const phrasePath = join(workDir, 'phrase.wav');
  run(['-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', phrasePath]);

  console.log(`Looping to ~${TARGET_MUSIC_SECONDS}s and adding warmth (echo) + overall fades...`);
  const phraseSeconds = CHORDS.length * CHORD_SECONDS;
  const loopCount = Math.ceil(TARGET_MUSIC_SECONDS / phraseSeconds);
  const musicOutPath = join(MUSIC_DIR, 'elegant-bed.mp3');
  run([
    '-stream_loop',
    String(loopCount - 1),
    '-i',
    phrasePath,
    '-filter_complex',
    `aecho=0.6:0.5:60:0.25,` +
      `afade=t=in:d=2,afade=t=out:st=${TARGET_MUSIC_SECONDS - 3}:d=3,` +
      `atrim=0:${TARGET_MUSIC_SECONDS}`,
    '-ar',
    '44100',
    musicOutPath,
  ]);

  console.log('Synthesizing transition whoosh SFX...');
  const sfxOutPath = join(SFX_DIR, 'transition.mp3');
  run([
    '-f',
    'lavfi',
    '-i',
    'anoisesrc=color=pink:duration=0.7:amplitude=0.6',
    '-filter_complex',
    'bandpass=f=1800:width_type=h:w=1400,' + 'afade=t=in:d=0.08,afade=t=out:st=0.35:d=0.35,volume=0.5',
    '-ar',
    '44100',
    sfxOutPath,
  ]);

  rmSync(workDir, {recursive: true, force: true});

  console.log(`\nMusic bed: ${musicOutPath}`);
  console.log(`Transition SFX: ${sfxOutPath}`);
}

main();
