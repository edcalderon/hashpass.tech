#!/usr/bin/env node
import {readFileSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";

const args = process.argv.slice(2);
if (!args.includes("--closing-day")) throw new Error("Use --closing-day for the scheduled final recap");
for (const name of ["EVENT_MEDIA_BUCKET", "EVENT_MEDIA_PUBLIC_BASE_URL", "EVENT_CAMPAIGN_DATABASE_URL", "EVENT_VIDEO_ACCOUNT_ID"]) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}
const output = resolve("apps/video-studio/out/bsl-bogota-2026/recap.mp4");
const bucket = process.env.EVENT_MEDIA_BUCKET;
const base = process.env.EVENT_MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "");
const identity = spawnSync("aws", ["--profile", "hashpass", "sts", "get-caller-identity", "--query", "Account", "--output", "text"], {encoding: "utf8"});
if (identity.status !== 0 || identity.stdout.trim() !== process.env.EVENT_VIDEO_ACCOUNT_ID) throw new Error("AWS identity does not match the configured production account");
const key = "events/colombia2026/branding/campaign/bsl-bogota-2026/recap.mp4";
const poster = output.replace(/\.mp4$/, ".jpg");
const captions = output.replace(/\.mp4$/, ".vtt");
if (spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", "2", "-i", output, "-frames:v", "1", poster]).status !== 0) throw new Error("Could not create recap poster");
writeFileSync(captions, "WEBVTT\n\n00:00:00.000 --> 00:01:30.000\nThank you, BSL community.\n");
const result = spawnSync("aws", ["--profile", "hashpass", "s3api", "put-object", "--bucket", bucket, "--key", key, "--body", output, "--content-type", "video/mp4", "--cache-control", "public,max-age=300"], {stdio: "inherit"});
if (result.status !== 0) process.exit(result.status ?? 1);
for (const [file, extension, contentType] of [[poster, "jpg", "image/jpeg"], [captions, "vtt", "text/vtt"]]) {
  const upload = spawnSync("aws", ["--profile", "hashpass", "s3api", "put-object", "--bucket", bucket, "--key", key.replace(".mp4", `.${extension}`), "--body", file, "--content-type", contentType, "--cache-control", "public,max-age=300"], {stdio: "inherit"});
  if (upload.status !== 0) process.exit(upload.status ?? 1);
}
const mediaRoot = `${base}/events/colombia2026/branding/campaign/bsl-bogota-2026`;
const manifest = {version: 1, campaignId: "bsl-bogota-2026", eventId: "colombia2026", closesAt: "2026-11-06T23:00:00.000Z", metricsCutoff: "2026-11-06T22:30:00.000Z", films: [
  {id: "welcome", title: "Bienvenidos a BSL Bogotá", durationMs: 50000, url: `${mediaRoot}/welcome.mp4`, poster: `${mediaRoot}/welcome.jpg`, captions: `${mediaRoot}/welcome.vtt`},
  {id: "walkthrough", title: "Tu BSL en HASHPASS", durationMs: 30000, url: `${mediaRoot}/walkthrough.mp4`, poster: `${mediaRoot}/walkthrough.jpg`, captions: `${mediaRoot}/walkthrough.vtt`},
  {id: "recap", title: "Gracias, comunidad BSL", durationMs: 90000, url: `${base}/${key}`, poster: `${base}/${key.replace(".mp4", ".jpg")}`, captions: `${base}/${key.replace(".mp4", ".vtt")}`}
]};
const manifestFile = resolve("apps/video-studio/out/bsl-bogota-2026/manifest.json");
writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
const manifestUpload = spawnSync("aws", ["--profile", "hashpass", "s3api", "put-object", "--bucket", bucket, "--key", "events/colombia2026/branding/campaign/bsl-bogota-2026/manifest.json", "--body", manifestFile, "--content-type", "application/json", "--cache-control", "public,max-age=60"], {stdio: "inherit"});
if (manifestUpload.status !== 0) process.exit(manifestUpload.status ?? 1);
readFileSync(output);
console.log(JSON.stringify(manifest));
