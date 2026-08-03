#!/usr/bin/env node
// Records a scripted (or free-scroll) browser session with Playwright and
// drops the result straight into apps/video-studio/public/recordings/, so
// it can be wired up as a `src` in apps/video-studio/src/content/clips.ts.
//
// Usage:
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/home \
//     --name landing/hero \
//     [--flow apps/video-studio/flows/landing.mjs] \
//     [--duration 8000] [--width 1920] [--height 1080]
//
// With no --flow, it just loads --url and auto-scrolls for --duration ms —
// useful for quick single-screen captures. For multi-step flows (click
// through a login, open a drawer, etc.) write a flow file exporting a
// default `async (page) => { ... }` function and pass it via --flow.
//
// `--name` may include subfolders (e.g. `auth/otp/verify`) — they're
// created under public/recordings/ as needed, matching the folder-per-flow
// layout (landing/, auth/otp/, auth/google/, dashboard/speakers/,
// dashboard/meetings/, bsl/).
//
// Authenticated flows (anything inside the dashboard) need a real session.
// Record the login once headed so you can complete OTP/Google by hand, save
// the session, then reuse it for every dashboard recording after that:
//
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/auth --name auth/otp/sign-in --headed \
//     --flow apps/video-studio/flows/auth-otp.mjs \
//     --save-state apps/video-studio/.recording-state/otp-session.json
//
//   pnpm --filter hashpass-video-studio record:web -- \
//     --url http://localhost:8081/events/chile-2026/networking --name dashboard/speakers/find-speakers \
//     --flow apps/video-studio/flows/dashboard-find-speakers.mjs \
//     --use-state apps/video-studio/.recording-state/otp-session.json
//
// Google's real OAuth consent screen actively blocks plain automated
// Chromium ("This browser or app may not be secure"). `--headed --channel
// chrome` (a real installed Chrome, not Playwright's bundled Chromium) gets
// closer to a normal browser fingerprint, but there is no fully reliable
// unattended way around Google's bot checks here — treat the Google
// sign-in recording as a manual, headed capture, not a scripted one.
//
// `--locale es-ES` records the app in Spanish: the app's i18n
// (apps/mobile-app/i18n/i18n.ts) picks its initial language from the
// browser's own locale (expo-localization) on first load, with no stored
// override — no in-app language-switcher click needed, just set the
// browser context's locale before navigating.
import {chromium} from 'playwright';
import {existsSync, mkdirSync, renameSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../..');
const RECORDINGS_DIR = join(REPO_ROOT, 'apps/video-studio/public/recordings');

function parseArgs(argv) {
  const args = {duration: 8000, width: 1920, height: 1080};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) continue;
    const flag = key.slice(2);
    const next = argv[i + 1];
    // Boolean flags (e.g. --headed) have no value token following them.
    if (next === undefined || next.startsWith('--')) {
      args[flag] = true;
    } else {
      args[flag] = next;
      i += 1;
    }
  }
  return args;
}

async function autoScroll(page, durationMs) {
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(400);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.url || !args.name) {
    console.error(
      'Usage: record-web-demo.mjs --url <url> --name <output-name> [--flow <path>] [--duration ms] ' +
        '[--headed] [--channel chrome] [--use-state <path>] [--save-state <path>] [--skip-warmup] [--locale es-ES]',
    );
    process.exit(1);
  }

  mkdirSync(RECORDINGS_DIR, {recursive: true});

  const width = Number(args.width);
  const height = Number(args.height);

  const browser = await chromium.launch({
    headless: !args.headed,
    channel: typeof args.channel === 'string' ? args.channel : undefined,
  });

  const useStatePath = typeof args['use-state'] === 'string' ? resolve(REPO_ROOT, args['use-state']) : undefined;
  if (useStatePath && !existsSync(useStatePath)) {
    console.error(`--use-state file not found: ${useStatePath}`);
    process.exit(1);
  }

  // Recording starts the moment the context/page exist, before goto even
  // begins — so a cold first navigation (page not yet fetched/hydrated)
  // bakes several seconds of blank/loading screen into the start of every
  // clip. Warm the browser's HTTP cache with a throwaway, unrecorded
  // navigation first so the real (recorded) navigation paints near-instantly.
  const locale = typeof args.locale === 'string' ? args.locale : undefined;

  if (!args['skip-warmup']) {
    console.log('Warming up (pre-fetching the page so the recording starts on real content)...');
    const warmupContext = await browser.newContext({viewport: {width, height}, storageState: useStatePath, locale});
    const warmupPage = await warmupContext.newPage();
    try {
      await warmupPage.goto(args.url, {waitUntil: 'networkidle', timeout: 30000});
    } catch (error) {
      console.warn('Warmup navigation failed (continuing anyway):', error.message);
    }
    await warmupContext.close();
  }

  const context = await browser.newContext({
    viewport: {width, height},
    recordVideo: {dir: RECORDINGS_DIR, size: {width, height}},
    storageState: useStatePath,
    locale,
  });
  const page = await context.newPage();

  console.log(`Navigating to ${args.url}`);
  await page.goto(args.url, {waitUntil: 'networkidle'});

  if (args.flow) {
    const flowPath = resolve(REPO_ROOT, args.flow);
    console.log(`Running flow: ${flowPath}`);
    const flowModule = await import(pathToFileURL(flowPath).href);
    await flowModule.default(page);
  } else {
    console.log(`No --flow given, auto-scrolling for ${args.duration}ms`);
    await autoScroll(page, Number(args.duration));
  }

  const saveStatePath = typeof args['save-state'] === 'string' ? resolve(REPO_ROOT, args['save-state']) : undefined;
  if (saveStatePath) {
    mkdirSync(dirname(saveStatePath), {recursive: true});
    await context.storageState({path: saveStatePath});
    console.log(`Saved session state: ${saveStatePath}`);
  }

  const video = page.video();
  await context.close();
  await browser.close();

  if (!video) {
    console.error('Playwright did not produce a video for this page.');
    process.exit(1);
  }

  const recordedPath = await video.path();
  const finalPath = join(RECORDINGS_DIR, `${args.name}.webm`);
  mkdirSync(dirname(finalPath), {recursive: true});
  renameSync(recordedPath, finalPath);

  const relativeName = `${args.name}.webm`;
  console.log(`\nSaved recording: ${finalPath}`);
  console.log(`Set src: '${relativeName}' on the matching clip in apps/video-studio/src/content/clips.ts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
