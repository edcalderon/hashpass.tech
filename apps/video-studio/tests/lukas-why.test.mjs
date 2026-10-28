import assert from 'node:assert/strict';
import test from 'node:test';
import {access, readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const repo = resolve(import.meta.dirname, '../../..');
const videoDirectory = resolve(repo, 'packages/infra/terraform/stacks/hashpass-lukas-site/overrides/public/lukas/videos');
const captionDirectory = resolve(repo, 'packages/infra/terraform/stacks/hashpass-lukas-site/overrides/public/lukas/captions');
const narrationDirectory = resolve(repo, 'apps/video-studio/public/audio/narration/lukas-why');
const locales = ['en', 'es', 'ko', 'fr', 'pt', 'de'];

test('Lukas why explainer publishes one 12-second video and caption track per supported locale', async () => {
  for (const locale of locales) {
    const video = resolve(videoDirectory, `why-${locale}.mp4`);
    const captions = resolve(captionDirectory, `why-${locale}.vtt`);
    const narration = resolve(narrationDirectory, `${locale}.mp3`);
    await access(video);
    const captionText = await readFile(captions, 'utf8');
    await access(narration);
    assert.match(captionText, /^WEBVTT/);
    assert.match(captionText, /00:04\.900 --> 00:10\.200/);

    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], {encoding: 'utf8'});
    assert.equal(probe.status, 0, `ffprobe failed for ${locale}`);
    assert.ok(Math.abs(Number(probe.stdout.trim()) - 12) < 0.2, `${locale} video must be 12 seconds`);
    const audioProbe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', video], {encoding: 'utf8'});
    assert.equal(audioProbe.status, 0, `audio stream missing for ${locale}`);
    assert.match(audioProbe.stdout, /aac|mp3|opus/);
  }
});

test('Lukas why composition keeps the locale set and actual coin asset references', async () => {
  const source = await readFile(resolve(repo, 'apps/video-studio/src/compositions/LukasWhyExplainer.tsx'), 'utf8');
  const content = await readFile(resolve(repo, 'apps/video-studio/src/content/lukas-why.ts'), 'utf8');
  assert.match(content, /LUKAS_WHY_LOCALES = \['en', 'es', 'ko', 'fr', 'pt', 'de'\]/);
  for (const coin of ['brl', 'mxn', 'cop', 'clp', 'ars', 'lukas']) {
    assert.match(source, new RegExp(`${coin}-coin\\.svg`));
  }
  assert.match(content, /1 LUKAS/);
  assert.match(content, /omni-chain/);
  const landingVideo = await readFile(resolve(repo, 'packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasWhyVideo.web.tsx'), 'utf8');
  assert.match(landingVideo, /src=\{source\}/);
  assert.match(landingVideo, /LukasCoin/);
  assert.match(landingVideo, /controls=\{started && ready\}/);
  assert.match(landingVideo, /requestFullscreen/);
  assert.match(landingVideo, /onMouseEnter=\{\(\) => setPlayButtonActive\(true\)\}/);
  assert.match(landingVideo, /play: 'Play video'/);
  assert.match(landingVideo, /playButtonActive/);
});
