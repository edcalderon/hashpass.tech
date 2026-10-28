#!/usr/bin/env node
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {dirname, isAbsolute, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputArg = process.argv.slice(2);
const outputIndex = outputArg.indexOf("--output");
const outputValue = outputIndex === -1 ? "out/bsl-bogota-2026/metrics.json" : outputArg[outputIndex + 1];
if (outputIndex !== -1 && !outputValue) throw new Error("--output requires a file path");
const output = isAbsolute(outputValue) ? outputValue : outputValue.startsWith("apps/") ? resolve(root, "../..", outputValue) : resolve(root, outputValue);
const databaseUrl = process.env.EVENT_CAMPAIGN_DATABASE_URL;
if (!databaseUrl) throw new Error("EVENT_CAMPAIGN_DATABASE_URL is required");

const sqlFile = resolve(root, "scripts/bsl-recap-metrics.sql");
if (!existsSync(sqlFile)) throw new Error("The BSL recap metrics query is missing");

const result = spawnSync("psql", ["--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1", "--file", sqlFile, databaseUrl], {
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (result.status !== 0) {
  throw new Error("The BSL recap metrics query failed");
}

const jsonLine = result.stdout.trim().split(/\n/).filter(Boolean).at(-1);
if (!jsonLine) throw new Error("The BSL recap metrics query returned no result");
const metrics = JSON.parse(jsonLine);
const counts = metrics?.counts;
if (metrics?.eventId !== "colombia2026" || metrics?.cutoff !== "2026-11-06T22:30:00Z" || !counts) {
  throw new Error("The BSL recap metrics result does not match the campaign cutoff");
}
for (const [name, value] of Object.entries(counts)) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`Invalid aggregate metric: ${name}`);
}

mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, `${JSON.stringify(metrics, null, 2)}\n`, {mode: 0o600});
console.log(`Captured aggregate BSL metrics at ${output}`);
