#!/usr/bin/env node
/**
 * Lockfile guard: fail locally when a lockfile is out of step with its package.json files, instead of in CI
 * (`ERR_PNPM_OUTDATED_LOCKFILE` / `npm ci` EUSAGE), which blocks every pull-request check at the install step.
 *
 *   node packages/tools/scripts/check-lockfiles.mjs            check everything
 *   node packages/tools/scripts/check-lockfiles.mjs --staged   only when a manifest or lockfile is staged (hook)
 *
 * Two checks, both offline and read-only:
 *   1. pnpm: `pnpm install --frozen-lockfile --lockfile-only` is exactly what CI runs, minus the download.
 *   2. npm:  every committed package-lock.json that lives outside the pnpm workspace is verified with
 *            `npm ci --dry-run`. Lockfiles inside a pnpm workspace package are covered by check 1.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const staged = process.argv.includes("--staged");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

const isManifest = (f) => /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|pnpm-workspace\.yaml|\.npmrc)$/.test(f) || /(^|\/)patches\//.test(f);

if (staged && !git("diff", "--cached", "--name-only").some(isManifest)) {
  console.log("🔒 Lockfile guard: no manifest or lockfile staged, skipping.");
  process.exit(0);
}

const failures = [];
const run = (label, cmd, args, cwd, hint) => {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env: { ...process.env, CI: "1", npm_config_loglevel: "error" } });
  if (r.status === 0) {
    console.log(`  ✓ ${label}`);
    return;
  }
  const detail = `${r.stdout}\n${r.stderr}`
    .split("\n")
    .filter((l) => /ERR_PNPM|npm error|specifiers|lockfile|package-lock|Missing:|Invalid:/i.test(l))
    .map((l) => l.replace(/\u001b\[[0-9;]*m/g, "").trim())
    .slice(0, 6);
  failures.push({ label, detail, hint });
  console.log(`  ✗ ${label}`);
};

console.log("🔒 Lockfile guard");
run("pnpm-lock.yaml matches every workspace package.json", "pnpm", ["install", "--frozen-lockfile", "--lockfile-only", "--ignore-scripts"], root, "pnpm install --lockfile-only   (then commit pnpm-lock.yaml)");

const workspaceDirs = new Set(
  git("ls-files", "--", "**/package.json", "package.json")
    .map((f) => dirname(f))
    .filter((d) => d === "." || existsSync(join(root, d, "package.json"))),
);
const inWorkspace = (dir) => {
  try {
    const out = execFileSync("pnpm", ["-s", "ls", "--depth", "-1", "--json", "-r"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out).some((p) => resolve(p.path) === resolve(root, dir));
  } catch {
    return false;
  }
};

for (const lock of git("ls-files", "--", "**/package-lock.json", "package-lock.json")) {
  const dir = dirname(lock);
  if (!workspaceDirs.has(dir)) continue;
  // npm ci reads package.json and package-lock.json only; a package that pnpm manages is checked above, but its
  // npm lockfile is what a Dockerfile `npm ci` reads, so it must agree too.
  const manifest = JSON.parse(readFileSync(join(root, dir, "package.json"), "utf8"));
  const label = `${lock} matches ${dir}/package.json (${manifest.name ?? dir}${inWorkspace(dir) ? ", pnpm workspace member" : ""})`;
  run(label, "npm", ["ci", "--dry-run", "--ignore-scripts", "--no-audit", "--no-fund"], join(root, dir), `cd ${dir} && npm install --package-lock-only --ignore-scripts   (then commit ${lock})`);
}

if (failures.length) {
  console.error("\n❌ Lockfile guard failed. CI would stop at the install step with these:\n");
  for (const f of failures) {
    console.error(`  • ${f.label}`);
    for (const d of f.detail) console.error(`      ${d}`);
    console.error(`    fix: ${f.hint}\n`);
  }
  console.error("Run the fix, stage the lockfile, and commit again.");
  process.exit(1);
}
console.log("✅ Lockfiles are in sync.");
