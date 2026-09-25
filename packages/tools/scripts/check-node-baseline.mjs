import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = file => readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));
const expected = read('.nvmrc').trim();
const failures = [];
if (!/^24\.\d+\.\d+$/.test(expected)) failures.push('.nvmrc must pin an exact Node 24 release');
if (process.versions.node !== expected) failures.push(`Node ${expected} is required; running ${process.versions.node}. Run nvm install && nvm use.`);
if (read('.node-version').trim() !== expected) failures.push('.node-version differs from .nvmrc');
if (json('package.json').engines?.node !== expected) failures.push('Root engines.node differs from .nvmrc');
if (json('packages/infra/lambda/package.json').engines?.node !== '24.x') failures.push('Lambda package must accept managed Node 24 patch updates');
for (const [profile, config] of Object.entries(json('apps/mobile-app/eas.json').build)) {
  if (config.node !== expected) failures.push(`EAS profile ${profile} differs from .nvmrc`);
}
for (const file of readdirSync(path.join(root, '.github/workflows')).filter(file => /\.ya?ml$/.test(file))) {
  const source = read(`.github/workflows/${file}`);
  const setups = source.match(/uses:\s*actions\/setup-node@[^\n]+/g) ?? [];
  const pins = source.match(/node-version-file:\s*['"]?\.nvmrc['"]?\s*$/gm) ?? [];
  if (setups.length !== pins.length || /\bnode-version:/.test(source)) failures.push(`${file} must select Node through .nvmrc`);
}
for (const module of ['aws_pipeline_ec2_worker', 'aws_github_actions_runner']) {
  const file = module === 'aws_pipeline_ec2_worker' ? 'build-worker-user-data.sh.tftpl' : 'runner-user-data.sh.tftpl';
  const source = read(`packages/infra/terraform/modules/${module}/templates/${file}`);
  if (!source.includes(`local node_version="${expected}"`)) failures.push(`${module} bootstrap differs from .nvmrc`);
}
for (const file of ['hashpass-static-site.yml', 'bsl-static-site-codebuild.yml', 'infra-deploy.yml', 'hashpass-web-deploy.yml']) {
  const source = read(`packages/tools/buildspecs/${file}`);
  if (!source.includes('nodejs: 24') || !source.includes('n "$(cat .nvmrc)"')) failures.push(`${file} must install the pinned Node 24 runtime`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Node ${expected}: runtime, local version files, CI and EAS pins agree.`);
}
