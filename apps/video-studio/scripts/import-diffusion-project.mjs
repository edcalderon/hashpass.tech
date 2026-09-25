import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const supportedCompositions = new Set(['AppTutorialEN', 'AppTutorialES', 'BslShowcase']);
const supportedMediaExtensions = new Set(['.mp4', '.mov', '.webm']);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultStudio = path.resolve(scriptDirectory, '..');

function usage() {
  return 'Usage: node scripts/import-diffusion-project.mjs --project <diffusion-project-directory> [--studio <video-studio-directory>]';
}

function parseArgs(args) {
  const values = {project: '', studio: defaultStudio};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--project') values.project = args[++index] ?? '';
    else if (arg === '--studio') values.studio = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!values.project) throw new Error(usage());
  return {project: path.resolve(values.project), studio: path.resolve(values.studio)};
}

function sourcePathWithinProject(project, source) {
  if (typeof source !== 'string' || !source) throw new Error('Each import needs a source path.');
  const resolved = path.resolve(project, source);
  if (!resolved.startsWith(`${project}${path.sep}`)) {
    throw new Error(`Import source must stay inside the Diffusion project: ${source}`);
  }
  return resolved;
}

function validateImport(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('Each import must be an object.');
  if (typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(entry.id)) {
    throw new Error('Each import needs an id using letters, numbers, and hyphens.');
  }
  if (!supportedCompositions.has(entry.composition)) {
    throw new Error(`Unsupported composition: ${entry.composition}`);
  }
  if (typeof entry.title !== 'string' || !entry.title.trim()) throw new Error(`Import ${entry.id} needs a title.`);
  if (entry.caption !== undefined && typeof entry.caption !== 'string') throw new Error(`Import ${entry.id} has an invalid caption.`);
  if (entry.trimStartSeconds !== undefined && (!Number.isFinite(entry.trimStartSeconds) || entry.trimStartSeconds < 0)) {
    throw new Error(`Import ${entry.id} has an invalid trimStartSeconds value.`);
  }
}

async function main() {
  const {project, studio} = parseArgs(process.argv.slice(2));
  const handoff = JSON.parse(await readFile(path.join(project, 'hashpass-handoff.json'), 'utf8'));
  if (handoff?.version !== 1 || handoff?.source !== 'diffusion-studio' || !Array.isArray(handoff.imports)) {
    throw new Error('hashpass-handoff.json must declare version 1, source "diffusion-studio", and imports.');
  }

  const manifestPath = path.join(studio, 'src', 'content', 'diffusion-imports.json');
  const current = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (current?.version !== 1 || !Array.isArray(current.imports)) {
    throw new Error('The studio diffusion-imports.json manifest is invalid.');
  }

  const recordingsDirectory = path.join(studio, 'public', 'recordings', 'diffusion');
  await mkdir(recordingsDirectory, {recursive: true});
  const importsById = new Map(current.imports.map((entry) => [entry.id, entry]));

  for (const entry of handoff.imports) {
    validateImport(entry);
    const source = sourcePathWithinProject(project, entry.source);
    const extension = path.extname(source).toLowerCase();
    if (!supportedMediaExtensions.has(extension)) throw new Error(`Unsupported media type for ${entry.id}: ${extension || 'none'}`);

    const src = `diffusion/${entry.id}${extension}`;
    await copyFile(source, path.join(recordingsDirectory, `${entry.id}${extension}`));
    importsById.set(entry.id, {
      id: entry.id,
      composition: entry.composition,
      src,
      title: entry.title.trim(),
      ...(entry.caption ? {caption: entry.caption} : {}),
      ...(entry.trimStartSeconds !== undefined ? {trimStartSeconds: entry.trimStartSeconds} : {}),
    });
  }

  await writeFile(
    manifestPath,
    `${JSON.stringify({version: 1, imports: [...importsById.values()]}, null, 2)}\n`,
  );
  console.log(`Imported ${handoff.imports.length} Diffusion Studio asset(s) into ${path.relative(process.cwd(), studio)}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
