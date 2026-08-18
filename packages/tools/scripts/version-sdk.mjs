import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm sdk:version <semver>");
  process.exit(1);
}

const packages = ["packages/sdk", "packages/sdk-cli"];
const missingChangelogEntry = [];
for (const dir of packages) {
  const manifestPath = `${dir}/package.json`;
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  value.version = version;
  await writeFile(manifestPath, `${JSON.stringify(value, null, 2)}\n`);

  const changelogPath = `${dir}/CHANGELOG.md`;
  const changelog = await readFile(changelogPath, "utf8").catch(() => "");
  if (!changelog.includes(`## [${version}]`)) missingChangelogEntry.push(changelogPath);
}

console.log(`Prepared @hashpass-tech/sdk and @hashpass-tech/sdk-cli v${version}.`);
if (missingChangelogEntry.length > 0) {
  console.warn(`\nWARNING: no "## [${version}]" entry found in:`);
  for (const path of missingChangelogEntry) console.warn(`  ${path}`);
  console.warn("Add a dated entry to each before tagging, or the published package ships an outdated changelog.\n");
}
console.log("After review, commit both manifests (and the changelogs) and create the immutable tag:");
console.log(`  git tag -s sdk-cli-v${version} -m "Hashpass SDK & CLI v${version}"`);
console.log(`  git push origin sdk-cli-v${version}`);
