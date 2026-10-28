#!/usr/bin/env node
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";

const args = process.argv.slice(2);
const closingDay = args.includes("--closing-day");
const initialPublish = args.includes("--initial");
if (closingDay === initialPublish) throw new Error("Use exactly one of --initial or --closing-day");
for (const name of ["EVENT_MEDIA_BUCKET", "EVENT_MEDIA_PUBLIC_BASE_URL", "EVENT_VIDEO_ACCOUNT_ID"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
if (closingDay && !process.env.EVENT_CAMPAIGN_DATABASE_URL) throw new Error("EVENT_CAMPAIGN_DATABASE_URL is required for --closing-day");
const metricsFile = resolve(process.env.EVENT_CAMPAIGN_METRICS_FILE ?? "apps/video-studio/out/bsl-bogota-2026/metrics.json");
const bucket = process.env.EVENT_MEDIA_BUCKET;
const base = process.env.EVENT_MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "");
const identity = spawnSync("aws", ["--profile", "hashpass", "sts", "get-caller-identity", "--query", "Account", "--output", "text"], {encoding: "utf8"});
if (identity.status !== 0 || identity.stdout.trim() !== process.env.EVENT_VIDEO_ACCOUNT_ID) throw new Error("AWS identity does not match the configured production account");
const mediaRoot = `${base}/events/colombia2026/branding/campaign/bsl-bogota-2026`;
const keyFor = (id, extension = "mp4") => `events/colombia2026/branding/campaign/bsl-bogota-2026/${id}.${extension}`;
const upload = (file, key, contentType) => {
  const result = spawnSync("aws", ["--profile", "hashpass", "s3api", "put-object", "--bucket", bucket, "--key", key, "--body", file, "--content-type", contentType, "--cache-control", "public,max-age=300"], {stdio: "inherit"});
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const welcomeCaptionTrack = (locale) => ({
  src: resolve(`apps/video-studio/public/audio/subtitles/campaign/${locale}/bsl-bogota-welcome.vtt`),
  key: keyFor(`welcome-${locale}`, "vtt"),
  language: locale,
  label: locale === "es" ? "Español" : "English",
});
const publicWelcomeCaptionTracks = (defaultLocale) => ["en", "es"].map((locale) => ({
  src: `${mediaRoot}/welcome-${locale}.vtt`,
  language: locale,
  label: locale === "es" ? "Español" : "English",
  default: locale === defaultLocale,
}));
const prepareAndUploadFilm = (id, title, durationSeconds, captionTracks = []) => {
  const film = resolve(`apps/video-studio/out/bsl-bogota-2026/${id}.mp4`);
  if (!existsSync(film)) throw new Error(`Missing ${id} film at ${film}`);
  const poster = film.replace(/\.mp4$/, ".jpg");
  const captions = film.replace(/\.mp4$/, ".vtt");
  if (spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", "2", "-i", film, "-frames:v", "1", poster]).status !== 0) throw new Error(`Could not create ${id} poster`);
  writeFileSync(captions, `WEBVTT\n\n00:00:00.000 --> 00:00:${String(durationSeconds).padStart(2, "0")}.000\n${title}\n`);
  upload(film, keyFor(id), "video/mp4");
  upload(poster, keyFor(id, "jpg"), "image/jpeg");
  upload(captions, keyFor(id, "vtt"), "text/vtt");
  for (const track of captionTracks) {
    if (!existsSync(track.src)) throw new Error(`Missing ${track.language} captions for ${id}`);
    upload(track.src, track.key, "text/vtt");
  }
};
if (initialPublish) {
  const welcomeCaptions = [welcomeCaptionTrack("en"), welcomeCaptionTrack("es")];
  prepareAndUploadFilm("welcome", "Welcome to BSL Bogotá.", 50, welcomeCaptions);
  prepareAndUploadFilm("welcome-en", "Welcome to BSL Bogotá.", 50, welcomeCaptions);
  prepareAndUploadFilm("walkthrough", "Your BSL experience in HASHPASS.", 30);
} else {
  if (!existsSync(metricsFile)) {
    const capture = spawnSync(process.execPath, [resolve("apps/video-studio/scripts/capture-bsl-recap-metrics.mjs"), "--output", metricsFile], {stdio: "inherit"});
    if (capture.status !== 0) process.exit(capture.status ?? 1);
  }
  const metrics = JSON.parse(readFileSync(metricsFile, "utf8"));
  if (metrics.eventId !== "colombia2026" || metrics.cutoff !== "2026-11-06T22:30:00Z" || !metrics.counts) throw new Error("Invalid BSL recap metrics file");
  prepareAndUploadFilm("recap", "Thank you, BSL community.", 90);
  for (const id of ["welcome", "welcome-en", "walkthrough"]) {
    for (const extension of ["mp4", "jpg", "vtt"]) {
      const check = spawnSync("aws", ["--profile", "hashpass", "s3api", "head-object", "--bucket", bucket, "--key", keyFor(id, extension)], {stdio: "ignore"});
      if (check.status !== 0) throw new Error(`The initial ${id} ${extension} asset is not published`);
    }
  }
}
const metrics = closingDay ? JSON.parse(readFileSync(metricsFile, "utf8")) : {cutoff: "2026-11-06T22:30:00Z"};
const spanishWelcomeCaptionTracks = publicWelcomeCaptionTracks("es");
const englishWelcomeCaptionTracks = publicWelcomeCaptionTracks("en");
const manifest = {version: 1, campaignId: "bsl-bogota-2026", eventId: "colombia2026", closesAt: "2026-11-06T23:00:00.000Z", metricsCutoff: metrics.cutoff, films: [
  {
    id: "welcome", title: "Bienvenidos a BSL Bogotá", durationMs: 50000, url: `${mediaRoot}/welcome.mp4`, poster: `${mediaRoot}/welcome.jpg`, captions: `${mediaRoot}/welcome-es.vtt`, captionTracks: spanishWelcomeCaptionTracks,
    alternateLocales: {
      en: {title: "Welcome to BSL Bogotá", durationMs: 50000, url: `${mediaRoot}/welcome-en.mp4`, poster: `${mediaRoot}/welcome-en.jpg`, captions: `${mediaRoot}/welcome-en.vtt`, captionTracks: englishWelcomeCaptionTracks},
    },
  },
  {id: "walkthrough", title: "Tu BSL en HASHPASS", durationMs: 30000, url: `${mediaRoot}/walkthrough.mp4`, poster: `${mediaRoot}/walkthrough.jpg`, captions: `${mediaRoot}/walkthrough.vtt`},
  {id: "recap", title: "Gracias, comunidad BSL", durationMs: 90000, url: `${mediaRoot}/recap.mp4`, poster: `${mediaRoot}/recap.jpg`, captions: `${mediaRoot}/recap.vtt`}
]};
const manifestFile = resolve("apps/video-studio/out/bsl-bogota-2026/manifest.json");
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
upload(manifestFile, "events/colombia2026/branding/campaign/bsl-bogota-2026/manifest.json", "application/json");
console.log(JSON.stringify(manifest));
