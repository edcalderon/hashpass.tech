#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = resolve(root, "out/bsl-bogota-2026");
mkdirSync(out, {recursive: true});
const films = [
  ["welcome", 50, "audio/narration/es/bsl-event-landing.mp3"],
  ["walkthrough", 30, "audio/narration/es/bsl-agenda-browse.mp3"],
  ["recap", 90, "audio/narration/es/bsl-meeting-request.mp3"],
];
for (const [id, seconds, audioFile] of films) {
  const result = spawnSync("pnpm", ["exec", "remotion", "render", "src/index.ts", `BslCampaign-${id}`, `${out}/${id}.mp4`, "--props", JSON.stringify({audioFile}), "--log", "error"], {cwd: root, stdio: "inherit"});
  if (result.status !== 0) process.exit(result.status ?? 1);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${out}/${id}.mp4`], {encoding: "utf8"});
  if (Math.abs(Number(probe.stdout) - seconds) > 0.2) throw new Error(`${id} duration mismatch`);
}
