#!/usr/bin/env node
// Renders every registered composition to out/<id>.mp4.
// Usage: pnpm --filter hashpass-video-studio render [compositionId]
import {spawnSync} from 'node:child_process';

const COMPOSITIONS = ['BslShowcase', 'AppTutorial'];

const targets = process.argv[2] ? [process.argv[2]] : COMPOSITIONS;

for (const id of targets) {
  console.log(`\nRendering ${id}...`);
  const result = spawnSync('npx', ['remotion', 'render', 'src/index.ts', id, `out/${id}.mp4`], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`Render failed for ${id}`);
    process.exit(result.status ?? 1);
  }
}
