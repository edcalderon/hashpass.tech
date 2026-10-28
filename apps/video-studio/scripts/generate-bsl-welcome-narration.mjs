#!/usr/bin/env node
// Generates the two localised BSL Bogotá welcome tracks from the reviewed
// campaign source. The Spanish cut uses a Colombian feminine voice; the
// English cut uses a male voice. Scene captions are emitted as WebVTT with
// the exact timeline used by BslCampaignWelcome.
import {spawnSync} from "node:child_process";
import {mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDirectory, "..");
const campaignPath = join(root, "src/content/bsl-bogota-campaign.json");
const narrationRoot = join(root, "public/audio/narration/campaign");
const captionsRoot = join(root, "public/audio/subtitles/campaign");

const toVttTime = (seconds) => {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secondsPart = Math.floor((milliseconds % 60_000) / 1000);
  const millisecondsPart = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}.${String(millisecondsPart).padStart(3, "0")}`;
};

const webVttFor = (scenes) => [
  "WEBVTT",
  "",
  ...scenes.flatMap((scene) => [
    `${toVttTime(scene.startSecond)} --> ${toVttTime(scene.endSecond)}`,
    scene.caption,
    "",
  ]),
].join("\n");

// A failed or empty synthesis must stop the workflow before Remotion renders silent or corrupt audio.
function assertPlayableNarration(mediaPath, timelineSeconds, locale) {
  if (statSync(mediaPath).size === 0) throw new Error(`The ${locale} BSL welcome narration is empty`);
  const probe = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mediaPath],
    {encoding: "utf8"},
  );
  const duration = Number(probe.stdout);
  if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`The ${locale} BSL welcome narration is not valid audio`);
  }
  if (duration > timelineSeconds) {
    throw new Error(`The ${locale} BSL welcome narration runs ${duration.toFixed(1)}s, past the ${timelineSeconds}s film`);
  }
}

function main() {
  const captionsOnly = process.argv.includes("--captions-only");
  if (!captionsOnly) {
    const available = spawnSync("edge-tts", ["--list-voices"], {stdio: "ignore"});
    if (available.error || available.status !== 0) {
      throw new Error("edge-tts is required. Install it with: pip install edge-tts");
    }
  }

  const campaign = JSON.parse(readFileSync(campaignPath, "utf8"));
  for (const [locale, content] of Object.entries(campaign.welcomeLocales)) {
    const languageDirectory = join(narrationRoot, locale);
    const captionDirectory = join(captionsRoot, locale);
    mkdirSync(languageDirectory, {recursive: true});
    mkdirSync(captionDirectory, {recursive: true});

    const mediaPath = join(languageDirectory, "bsl-bogota-welcome.mp3");
    const captionPath = join(captionDirectory, "bsl-bogota-welcome.vtt");
    if (!captionsOnly) {
      const result = spawnSync(
        "edge-tts",
        ["--voice", content.voice, `--rate=${content.rate}`, "--text", content.voiceover, "--write-media", mediaPath],
        {stdio: "inherit"},
      );
      if (result.status !== 0) {
        rmSync(mediaPath, {force: true});
        throw new Error(`Could not synthesize the ${locale} BSL welcome narration`);
      }
      assertPlayableNarration(mediaPath, content.scenes.at(-1).endSecond, locale);
    }
    writeFileSync(captionPath, webVttFor(content.scenes));
    console.log(
      captionsOnly
        ? `Generated ${locale} captions: ${captionPath}`
        : `Generated ${locale}: ${mediaPath} and ${captionPath}`,
    );
  }
}

main();
