import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [bump, ...args] = process.argv.slice(2);
const noteIndex = args.indexOf("--note");
const note = noteIndex >= 0 ? args[noteIndex + 1] : undefined;

if (!["patch", "minor", "major"].includes(bump) || !note?.trim()) {
  console.error("Usage: npm run bump -- <patch|minor|major> --note \"What changed\"");
  process.exit(1);
}

const packagePath = join(ROOT, "package.json");
const pluginPath = join(ROOT, "plugin.json");
const changelogPath = join(ROOT, "CHANGELOG.md");
const packageManifest = JSON.parse(await readFile(packagePath, "utf8"));
const pluginManifest = JSON.parse(await readFile(pluginPath, "utf8"));
const current = packageManifest.version.split(".").map(Number);
if (current.length !== 3 || current.some((part) => !Number.isInteger(part))) {
  throw new Error(`Cannot bump non-release version ${packageManifest.version}`);
}

if (bump === "major") current[0] += 1;
if (bump === "minor") {
  current[1] += 1;
  current[2] = 0;
}
if (bump === "patch") current[2] += 1;

const nextVersion = current.join(".");
packageManifest.version = nextVersion;
pluginManifest.version = nextVersion;
await writeFile(packagePath, `${JSON.stringify(packageManifest, null, 2)}\n`);
await writeFile(pluginPath, `${JSON.stringify(pluginManifest, null, 2)}\n`);

const changelog = await readFile(changelogPath, "utf8");
const entry = `## [${nextVersion}] - ${new Date().toISOString().slice(0, 10)}\n\n- ${note.trim()}\n\n`;
const titleEnd = changelog.startsWith("# Changelog") ? "# Changelog\n\n" : "";
const body = titleEnd ? changelog.slice(titleEnd.length) : changelog;
await writeFile(changelogPath, `${titleEnd}${entry}${body}`);
console.log(`Bumped plugin package to v${nextVersion}`);
