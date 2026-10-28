#!/usr/bin/env node
import {spawnSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const out = resolve(root, "out/bsl-bogota-2026");
mkdirSync(out, {recursive: true});
const films = [
  ["welcome", "BslCampaign-welcome", 50],
  ["welcome-en", "BslCampaign-welcome-en", 50],
  ["walkthrough", "BslCampaign-walkthrough", 30],
  ["recap", "BslCampaign-recap", 90],
];
for (const [id, compositionId, seconds] of films) {
  const result = spawnSync("pnpm", ["exec", "remotion", "render", "src/index.ts", compositionId, `${out}/${id}.mp4`, "--log", "error"], {cwd: root, stdio: "inherit"});
  if (result.status !== 0) process.exit(result.status ?? 1);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${out}/${id}.mp4`], {encoding: "utf8"});
  if (Math.abs(Number(probe.stdout) - seconds) > 0.2) throw new Error(`${id} duration mismatch`);
}
