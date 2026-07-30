import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: pnpm sdk:version <semver>");
  process.exit(1);
}

const manifests = ["packages/sdk/package.json", "packages/sdk-cli/package.json"];
for (const manifest of manifests) {
  const value = JSON.parse(await readFile(manifest, "utf8"));
  value.version = version;
  await writeFile(manifest, `${JSON.stringify(value, null, 2)}\n`);
}

console.log(`Prepared @hashpass/sdk and @hashpass/sdk-cli v${version}.`);
console.log("After review, commit both manifests and create the immutable tag:");
console.log(`  git tag -s sdk-cli-v${version} -m "Hashpass SDK & CLI v${version}"`);
console.log(`  git push origin sdk-cli-v${version}`);
