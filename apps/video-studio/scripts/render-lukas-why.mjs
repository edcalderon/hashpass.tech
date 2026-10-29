#!/usr/bin/env node
import {copyFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const studio = path.resolve(scriptDirectory, '..');
const locales = ['en', 'es', 'ko', 'fr', 'pt', 'de'];

function parseArgs(args) {
  const options = {output: path.join(studio, 'out', 'lukas-why'), publish: false};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--') continue;
    if (args[index] === '--output') options.output = path.resolve(args[++index] ?? '');
    else if (args[index] === '--publish') options.publish = true;
    else if (args[index] === '--locale') options.locales = [args[++index] ?? ''];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  return {...options, locales: options.locales ?? locales};
}

function run(command, args, cwd = studio) {
  const result = spawnSync(command, args, {cwd, encoding: 'utf8', stdio: 'inherit', shell: false});
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function duration(file) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {encoding: 'utf8'});
  if (result.status !== 0) throw new Error(`Could not inspect ${file}`);
  return Number(result.stdout.trim());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await mkdir(options.output, {recursive: true});
  for (const locale of options.locales) {
    if (!locales.includes(locale)) throw new Error(`Unsupported Lukas locale: ${locale}`);
    const narration = path.join(studio, 'public', 'audio', 'narration', 'lukas-why', `${locale}.mp3`);
    if (!existsSync(narration)) throw new Error(`Missing ${narration}; run pnpm --filter hashpass-video-studio lukas:why:audio first`);
    const target = path.join(options.output, `why-${locale}.mp4`);
    console.log(`Rendering Lukas why explainer (${locale})...`);
    const browserArgs = process.env.REMOTION_BROWSER_EXECUTABLE
      ? ['--browser-executable', process.env.REMOTION_BROWSER_EXECUTABLE]
      : [];
    const chromeModeArgs = process.env.REMOTION_CHROME_MODE
      ? ['--chrome-mode', process.env.REMOTION_CHROME_MODE]
      : [];
    run('pnpm', ['exec', 'remotion', 'render', 'src/index.ts', `LukasWhy-${locale}`, target, '--codec', 'h264', '--crf', '28', '--log', 'error', ...browserArgs, ...chromeModeArgs]);
    const seconds = duration(target);
    if (Math.abs(seconds - 12) > 0.2) throw new Error(`${locale} duration is ${seconds}s; expected 12s`);
  }

  if (options.publish) {
    const publicDirectory = path.resolve(studio, '../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/public/lukas/videos');
    await mkdir(publicDirectory, {recursive: true});
    for (const locale of options.locales) {
      await copyFile(path.join(options.output, `why-${locale}.mp4`), path.join(publicDirectory, `why-${locale}.mp4`));
    }
    console.log(`Published ${options.locales.length} Lukas why video(s) to ${publicDirectory}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
