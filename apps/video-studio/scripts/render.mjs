#!/usr/bin/env node
// Renders every registered composition to out/<id>.mp4.
// Usage: pnpm --filter hashpass-video-studio render [compositionId]
import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));

function readCampaignMetrics() {
  const configured = process.env.EVENT_CAMPAIGN_METRICS_FILE;
  if (!configured) return undefined;
  const candidates = [resolve(process.cwd(), configured), resolve(packageRoot, configured)];
  const file = candidates.find((candidate) => existsSync(candidate));
  if (!file) throw new Error(`Campaign metrics file not found: ${configured}`);
  const metrics = JSON.parse(readFileSync(file, 'utf8'));
  if (metrics?.eventId !== 'colombia2026' || !metrics?.counts) throw new Error('Invalid campaign metrics file');
  return metrics.counts;
}

const COMPOSITIONS = ['BslShowcase', 'AppTutorialEN', 'AppTutorialES', 'BslCampaign-welcome', 'BslCampaign-walkthrough', 'BslCampaign-recap'];

const targets = process.argv[2] ? [process.argv[2]] : COMPOSITIONS;
const metricValues = readCampaignMetrics();

for (const id of targets) {
  console.log(`\nRendering ${id}...`);
  const props = id === 'BslCampaign-recap' && metricValues ? ['--props', JSON.stringify({metricValues})] : [];
  const result = spawnSync('npx', ['remotion', 'render', 'src/index.ts', id, `out/${id}.mp4`, ...props], {
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`Render failed for ${id}`);
    process.exit(result.status ?? 1);
  }
}
