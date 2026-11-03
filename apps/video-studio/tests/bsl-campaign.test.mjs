import test from "node:test";
import assert from "node:assert/strict";
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";
import {spawnSync} from "node:child_process";
import campaign from "../src/content/bsl-bogota-campaign.json" with {type: "json"};
import {getWelcomeCaptionLayout} from "../src/lib/welcome-caption-layout.ts";
import {getTranscriptCueTimings, synthesizeVoiceover, webVttFor} from "../scripts/generate-bsl-welcome-narration.mjs";

const vttTime = (seconds) => {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secondsPart = Math.floor((milliseconds % 60_000) / 1000);
  const millisecondsPart = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}.${String(millisecondsPart).padStart(3, "0")}`;
};

test("BSL campaign has the requested durations and Bogotá schedule", () => {
  assert.equal(campaign.eventId, "colombia2026");
  assert.deepEqual(campaign.films.map((film) => film.durationSeconds), [50, 30, 90]);
  assert.equal(Date.parse(campaign.closesAt), Date.parse("2026-11-06T23:00:00.000Z"));
});

test("welcome voiceovers use a localized brand pronunciation and captions match the scene timeline", () => {
  for (const [locale, content] of Object.entries(campaign.welcomeLocales)) {
    assert.match(content.voiceover, locale === "es" ? /Jashh Pass/i : /Hash Pass/i);
    assert.doesNotMatch(content.voiceover, /HASHPASS/i);
    assert.equal(content.scenes.map((scene) => scene.transcript).join(" "), content.voiceover);
    if (locale === "es") {
      assert.equal(content.voice, "es-CO-SalomeNeural", "Spanish brand pronunciation must stay in the Colombian voice");
      assert.equal(content.voiceoverPronunciationOverrides, undefined, "Spanish narration must not switch voices for the brand");
    }

    const cueTimings = getTranscriptCueTimings(content.scenes, 50);
    const expectedVtt = [
      "WEBVTT",
      "",
      ...content.scenes.flatMap((scene, index) => [
        `${vttTime(cueTimings[index].startSecond)} --> ${vttTime(cueTimings[index].endSecond)}`,
        scene.transcript,
        "",
      ]),
    ].join("\n");
    assert.equal(webVttFor(content.scenes, 50), expectedVtt, `${locale} VTT captions must match the transcript and timing`);
    assert.equal(cueTimings.at(-1).endSecond, 50, `${locale} cues must end with the narration timeline`);
    assert.ok(cueTimings[0].endSecond < content.scenes[0].endSecond, `${locale} opening cue must follow its spoken length`);
    assert.match(content.scenes[4].caption, /HASH PASS/);
    assert.doesNotMatch(content.scenes[4].caption, /HASHPASS/i);
  }

  for (const film of campaign.films) {
    if (film.id === "welcome") {
      assert.match(film.voiceover, /Jashh Pass/i, `${film.id} narration must use the Spanish phonetic spelling`);
    }
    assert.doesNotMatch(film.voiceover, /HASHPASS/i, `${film.id} voiceover must not pronounce the brand as one word`);
  }
});

test("welcome captions sit centered above the player controls in a lower-third safe area", () => {
  const layout = getWelcomeCaptionLayout(1920, 1080);

  assert.equal(layout.bottom, 124);
  assert.equal(layout.horizontalInset, 134);
  assert.equal(layout.maxWidth, 1651);
  assert.equal(layout.fontSize, 27);
  assert.ok(layout.bottom > 108, "captions should clear the bottom 10% player-control zone");
  assert.ok(layout.horizontalInset > 96, "captions should clear 5% side overlays");
});

test("caption alignment and width limits are applied inside each Remotion scene sequence", () => {
  const composition = readFileSync(
    resolve(import.meta.dirname, "../src/compositions/BslCampaignWelcome.tsx"),
    "utf8",
  );
  const captionSequence = composition.indexOf("key={`caption-${scene.startSecond}`}");
  const captionLayout = composition.indexOf("bottom: captionLayout.bottom", captionSequence);
  const sequenceEnd = composition.indexOf("</Sequence>", captionSequence);
  const captionSequenceBody = composition.slice(captionSequence, sequenceEnd);

  assert.ok(captionSequence >= 0, "each caption must render in its own timed sequence");
  assert.ok(captionLayout > captionSequence, "safe-area positioning must be inside the scene sequence");
  assert.match(captionSequenceBody, /justifyContent: "center"/);
  assert.match(captionSequenceBody, /maxWidth: captionLayout\.maxWidth/);
  assert.match(captionSequenceBody, /overflowWrap: "anywhere"/);
});

test("Bogotá aerial loop crossfades its end into the opening frames", () => {
  const composition = readFileSync(
    resolve(import.meta.dirname, "../src/compositions/BslCampaignWelcome.tsx"),
    "utf8",
  );

  assert.match(composition, /BOGOTA_AERIAL_LOOP_FRAMES = BOGOTA_AERIAL_SOURCE_FRAMES - BOGOTA_AERIAL_CROSSFADE_FRAMES/);
  assert.match(composition, /durationInFrames=\{BOGOTA_AERIAL_LOOP_FRAMES\}/);
  assert.match(composition, /trimBefore=\{BOGOTA_AERIAL_CROSSFADE_FRAMES\}/);
  assert.match(composition, /trimAfter=\{BOGOTA_AERIAL_SOURCE_FRAMES\}/);
  assert.match(composition, /from=\{BOGOTA_AERIAL_LOOP_FRAMES - BOGOTA_AERIAL_CROSSFADE_FRAMES\}/);
  assert.match(composition, /opacity,\s+position: "absolute"/);
});

test("welcome narration replaces the prior track only after synthesis and duration validation", (t) => {
  const root = mkdtempSync(join(import.meta.dirname, ".bsl-narration-test-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const mediaPath = join(root, "bsl-bogota-welcome.mp3");
  writeFileSync(mediaPath, "previous narration");
  const commands = [];
  const runCommand = (command, args) => {
    commands.push(command);
    if (command === "edge-tts") {
      assert.deepEqual(args.slice(0, 5), ["--voice", "es-CO-SalomeNeural", "--rate=-3%", "--text", "Jashh Pass"]);
      writeFileSync(args.at(-1), "new narration");
      return {status: 0};
    }
    assert.equal(command, "ffprobe");
    return {status: 0, stdout: "45.5\n"};
  };

  synthesizeVoiceover(
    {voice: "es-CO-SalomeNeural", rate: "-3%", voiceover: "Jashh Pass"},
    mediaPath,
    50,
    "es",
    runCommand,
  );

  assert.equal(readFileSync(mediaPath, "utf8"), "new narration");
  assert.deepEqual(commands, ["edge-tts", "ffprobe"]);
  assert.deepEqual(readdirSync(root), ["bsl-bogota-welcome.mp3"]);
});

test("failed welcome narration synthesis preserves the existing track", (t) => {
  const root = mkdtempSync(join(import.meta.dirname, ".bsl-narration-test-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const mediaPath = join(root, "bsl-bogota-welcome.mp3");
  writeFileSync(mediaPath, "previous narration");

  assert.throws(
    () => synthesizeVoiceover(
      {voice: "es-CO-SalomeNeural", rate: "-3%", voiceover: "Jashh Pass"},
      mediaPath,
      50,
      "es",
      () => ({status: 1, stderr: "service unavailable"}),
    ),
    /Could not synthesize the es BSL welcome narration: service unavailable/,
  );

  assert.equal(readFileSync(mediaPath, "utf8"), "previous narration");
  assert.deepEqual(readdirSync(root), ["bsl-bogota-welcome.mp3"]);
});

test("rejected narration duration preserves the existing track and removes temp files", (t) => {
  const root = mkdtempSync(join(import.meta.dirname, ".bsl-narration-test-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const mediaPath = join(root, "bsl-bogota-welcome.mp3");
  writeFileSync(mediaPath, "previous narration");
  const runCommand = (command, args) => {
    if (command === "edge-tts") {
      writeFileSync(args.at(-1), "new narration");
      return {status: 0};
    }
    return {status: 0, stdout: "51.0\n"};
  };

  assert.throws(
    () => synthesizeVoiceover(
      {voice: "es-CO-SalomeNeural", rate: "-3%", voiceover: "Jashh Pass"},
      mediaPath,
      50,
      "es",
      runCommand,
    ),
    /runs 51\.0s, past the 50s film/,
  );

  assert.equal(readFileSync(mediaPath, "utf8"), "previous narration");
  assert.deepEqual(readdirSync(root), ["bsl-bogota-welcome.mp3"]);
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
  const root = mkdtempSync(join(import.meta.dirname, ".bsl-campaign-manifest-"));
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
  writeFileSync(awsStub, `#!${process.execPath}
if (process.argv.includes("get-caller-identity")) console.log("123456789012");
`);
  chmodSync(awsStub, 0o755);
  const awsStubProbe = spawnSync(awsStub, ["sts", "get-caller-identity"], {encoding: "utf8"});
  if (awsStubProbe.error?.code === "EPERM") {
    t.skip("the current sandbox blocks executing local CLI stubs");
    return;
  }
  const ffmpegStub = join(bin, "ffmpeg");
  writeFileSync(ffmpegStub, `#!${process.execPath}
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
