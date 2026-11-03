#!/usr/bin/env node
// Generates the two localised BSL Bogotá welcome tracks from the reviewed
// campaign source. The Spanish source spells the brand “Jashh Pass” for the
// Colombian voice, while the English source uses “Hash Pass”. Transcript cue
// times are weighted to the measured narration duration.
import {spawnSync} from "node:child_process";
import {existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from "node:fs";
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

const transcriptWeight = (transcript) => {
  const words = transcript.trim().split(/\s+/);
  const letterWeight = words.reduce((total, word) => {
    const letters = [...word].filter((character) => /\p{L}/u.test(character)).length;
    return total + Math.max(1, letters / 5);
  }, 0);
  const commas = (transcript.match(/[,;:]/g) ?? []).length;
  const sentenceEnds = (transcript.match(/[.!?]/g) ?? []).length;
  return letterWeight + commas * 0.25 + sentenceEnds * 0.45;
};

export function getTranscriptCueTimings(scenes, durationSeconds) {
  const durationMs = Math.round(durationSeconds * 1000);
  const weights = scenes.map((scene) => transcriptWeight(scene.transcript));
  const totalWeight = weights.reduce((total, weight) => total + weight, 0);
  if (!Number.isFinite(durationMs) || durationMs <= 0 || totalWeight <= 0) {
    throw new Error("Cannot time empty or invalid narration captions");
  }

  let accumulatedWeight = 0;
  let previousEndMs = 0;
  return scenes.map((_, index) => {
    accumulatedWeight += weights[index];
    const endMs = index === scenes.length - 1
      ? durationMs
      : Math.round((durationMs * accumulatedWeight) / totalWeight);
    const cue = {startSecond: previousEndMs / 1000, endSecond: endMs / 1000};
    previousEndMs = endMs;
    return cue;
  });
}

export const webVttFor = (scenes, durationSeconds = scenes.at(-1).endSecond) => [
  "WEBVTT",
  "",
  ...getTranscriptCueTimings(scenes, durationSeconds).flatMap((cue, index) => [
    `${toVttTime(cue.startSecond)} --> ${toVttTime(cue.endSecond)}`,
    scenes[index].transcript,
    "",
  ]),
].join("\n");

const commandFailureDetail = (result) => {
  const detail = result.error?.message ?? result.stderr?.trim();
  return detail ? `: ${detail}` : "";
};

// A failed or empty synthesis must stop the workflow before Remotion renders silent or corrupt audio.
export function assertPlayableNarration(mediaPath, timelineSeconds, locale, runCommand = spawnSync) {
  if (statSync(mediaPath).size === 0) throw new Error(`The ${locale} BSL welcome narration is empty`);
  const probe = runCommand(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mediaPath],
    {encoding: "utf8"},
  );
  const duration = Number(probe.stdout);
  if (probe.status !== 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`The ${locale} BSL welcome narration is not valid audio${commandFailureDetail(probe)}`);
  }
  if (duration > timelineSeconds) {
    throw new Error(`The ${locale} BSL welcome narration runs ${duration.toFixed(1)}s, past the ${timelineSeconds}s film`);
  }
  return duration;
}

export function synthesizeVoiceover(content, mediaPath, timelineSeconds, locale, runCommand = spawnSync) {
  const workingDirectory = mkdtempSync(join(dirname(mediaPath), ".bsl-welcome-"));
  const candidatePath = join(workingDirectory, "narration.mp3");
  try {
    const result = runCommand(
      "edge-tts",
      ["--voice", content.voice, `--rate=${content.rate}`, "--text", content.voiceover, "--write-media", candidatePath],
      {encoding: "utf8"},
    );
    if (result.error || result.status !== 0) {
      throw new Error(`Could not synthesize the ${locale} BSL welcome narration${commandFailureDetail(result)}`);
    }

    const duration = assertPlayableNarration(candidatePath, timelineSeconds, locale, runCommand);
    renameSync(candidatePath, mediaPath);
    return duration;
  } finally {
    rmSync(workingDirectory, {recursive: true, force: true});
  }
}

function main() {
  const captionsOnly = process.argv.includes("--captions-only");
  if (!captionsOnly) {
    const available = spawnSync("edge-tts", ["--list-voices"], {stdio: "ignore"});
    if (available.error || available.status !== 0) {
      throw new Error("edge-tts is required. Install it with: pip install edge-tts");
    }
    const version = spawnSync("edge-tts", ["--version"], {encoding: "utf8"});
    if (version.status !== 0 || !/edge-tts 7\.3\./.test(version.stdout)) {
      throw new Error("BSL narration requires edge-tts 7.3.x. Follow the pinned install instructions in apps/video-studio/README.md");
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
    let narrationDuration = content.scenes.at(-1).endSecond;
    if (captionsOnly && existsSync(mediaPath)) {
      narrationDuration = assertPlayableNarration(mediaPath, content.scenes.at(-1).endSecond, locale);
    } else if (!captionsOnly) {
      narrationDuration = synthesizeVoiceover(content, mediaPath, content.scenes.at(-1).endSecond, locale);
    }
    writeFileSync(captionPath, webVttFor(content.scenes, narrationDuration));
    console.log(
      captionsOnly
        ? `Generated ${locale} captions: ${captionPath}`
        : `Generated ${locale}: ${mediaPath} and ${captionPath}`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
