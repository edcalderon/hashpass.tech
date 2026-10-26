import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validatePlugin } from "./validate.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PACKAGE_FILES = ["plugin.json", "mcp.json", "README.md", "CHANGELOG.md", "assets/hashpass-symbol.png"];

const packageManifest = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
const validation = await validatePlugin(ROOT);
const outputDirectory = join(ROOT, "dist");
await mkdir(outputDirectory, { recursive: true });

const archivePath = join(outputDirectory, `${validation.name}-v${packageManifest.version}.zip`);
const stagingDirectory = await mkdtemp(join(outputDirectory, ".staging-"));

try {
  await mkdir(join(stagingDirectory, "assets"), { recursive: true });
  await Promise.all(PACKAGE_FILES.map((file) => cp(join(ROOT, file), join(stagingDirectory, file))));
  const zip = spawnSync("zip", ["-X", "-q", "-r", archivePath, ...PACKAGE_FILES], {
    cwd: stagingDirectory,
    stdio: "inherit"
  });
  if (zip.error) throw zip.error;
  if (zip.status !== 0) throw new Error(`zip exited with status ${zip.status}`);

  const integrity = spawnSync("unzip", ["-tqq", archivePath], { stdio: "inherit" });
  if (integrity.error) throw integrity.error;
  if (integrity.status !== 0) throw new Error(`unzip integrity check exited with status ${integrity.status}`);

  console.log(`Built ${archivePath}`);
} finally {
  await rm(stagingDirectory, { recursive: true, force: true });
}
