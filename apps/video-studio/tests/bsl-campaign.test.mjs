import test from "node:test";
import assert from "node:assert/strict";
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {spawnSync} from "node:child_process";
import campaign from "../src/content/bsl-bogota-campaign.json" with {type: "json"};

test("BSL campaign has the requested durations and Bogotá schedule", () => {
  assert.equal(campaign.eventId, "colombia2026");
  assert.deepEqual(campaign.films.map((film) => film.durationSeconds), [50, 30, 90]);
  assert.equal(Date.parse(campaign.closesAt), Date.parse("2026-11-06T23:00:00.000Z"));
});

test("initial publish generates and validates localized narration before rendering", () => {
  const workflow = readFileSync(
    resolve(import.meta.dirname, "../../../.github/workflows/bsl-campaign-initial-publish.yml"),
    "utf8",
  );
  const install = workflow.indexOf("edge-tts==7.3.1");
  const generate = workflow.indexOf("pnpm --filter hashpass-video-studio bsl:welcome:narration");
  const validate = workflow.indexOf("test -s \"apps/video-studio/public/audio/narration/campaign/$locale/bsl-bogota-welcome.mp3\"");
  const prepareAssets = workflow.indexOf("node apps/video-studio/scripts/prepare-event-hero-assets.mjs");
  const render = workflow.indexOf("node apps/video-studio/scripts/render-bsl-campaign.mjs");

  assert.ok(install >= 0, "workflow must install the pinned edge-tts version");
  assert.ok(generate > install, "workflow must generate narration after installing edge-tts");
  assert.ok(validate > generate, "workflow must validate generated localized assets");
  assert.ok(prepareAssets > validate, "workflow must prepare reviewed event logos before rendering");
  assert.ok(render > prepareAssets, "workflow must render only after narration and logo preparation");
  assert.match(workflow, /test -s "apps\/video-studio\/public\/audio\/subtitles\/campaign\/\$locale\/bsl-bogota-welcome\.vtt"/);
});

test("published welcome captions default to the language of each localized cut", (t) => {
  const root = mkdtempSync(join(tmpdir(), "bsl-campaign-manifest-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));

  const bin = join(root, "bin");
  const output = join(root, "apps/video-studio/out/bsl-bogota-2026");
  const subtitles = join(root, "apps/video-studio/public/audio/subtitles/campaign");
  mkdirSync(bin, {recursive: true});
  mkdirSync(output, {recursive: true});
  for (const locale of ["en", "es"]) {
    const localeDirectory = join(subtitles, locale);
    mkdirSync(localeDirectory, {recursive: true});
    writeFileSync(join(localeDirectory, "bsl-bogota-welcome.vtt"), "WEBVTT");
  }
  for (const id of ["welcome", "welcome-en", "walkthrough"]) {
    writeFileSync(join(output, `${id}.mp4`), "video");
  }

  const awsStub = join(bin, "aws");
  writeFileSync(awsStub, `#!/usr/bin/env node
if (process.argv.includes("get-caller-identity")) console.log("123456789012");
`);
  chmodSync(awsStub, 0o755);
  const ffmpegStub = join(bin, "ffmpeg");
  writeFileSync(ffmpegStub, `#!/usr/bin/env node
require("node:fs").writeFileSync(process.argv.at(-1), "poster");
`);
  chmodSync(ffmpegStub, 0o755);

  const script = resolve(import.meta.dirname, "../scripts/publish-bsl-campaign.mjs");
  const result = spawnSync(process.execPath, [script, "--initial"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      EVENT_MEDIA_BUCKET: "test-bucket",
      EVENT_MEDIA_PUBLIC_BASE_URL: "https://media.example.test",
      EVENT_VIDEO_ACCOUNT_ID: "123456789012",
    },
  });
  assert.equal(result.status, 0, result.stderr);

  const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
  const welcome = manifest.films.find((film) => film.id === "welcome");
  const alternate = welcome.alternateLocales.en;
  const defaultLanguages = (film) => film.captionTracks.filter((track) => track.default).map((track) => track.language);

  assert.ok(welcome.captions.endsWith("welcome-es.vtt"));
  assert.ok(alternate.captions.endsWith("welcome-en.vtt"));
  assert.deepEqual(defaultLanguages(welcome), ["es"]);
  assert.deepEqual(defaultLanguages(alternate), ["en"]);
});
