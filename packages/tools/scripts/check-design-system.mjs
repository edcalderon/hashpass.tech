#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const baselinePath = path.join(root, 'packages/ui/design-debt.json');
const roots = ['apps/mobile-app/components', 'apps/mobile-app/app', 'apps/mobile-app/lib/theme.ts', 'packages/ui/src'];
const excluded = /(?:\/tests\/|\.test\.|\.stories\.|\/system\/|\/tokens\.ts$|\/primitives\.ts$|\/api\/)/;
export function collectStyleLiterals(source, filename = 'screen.tsx') {
  const findings = {};
  const add = key => { findings[key] = (findings[key] || 0) + 1; };
  const parsed = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = node => {
    if (ts.isPropertyAssignment(node)) {
      const name = node.name.getText(parsed).replace(/['"]/g, '');
      const value = node.initializer;
      if (name === 'borderRadius' && ts.isNumericLiteral(value) && Number(value.text) !== 0) add(`radius:${value.text}`);
      if (/^(?:backgroundColor|borderColor|color|shadowColor)$/.test(name) && ts.isStringLiteral(value) && /^(?:#|rgba?\(|hsla?\()/i.test(value.text)) add(`${name}:${value.text.toLowerCase()}`);
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      for (const match of node.text.matchAll(/\brounded-\[([^\]]+)\]/g)) add(`arbitrary-radius:${match[1]}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed); return findings;
}
export function introducedStyles(current, baseline) {
  return Object.entries(current).filter(([key, count]) => count > (baseline[key] || 0));
}
function scan() {
  const files = [];
  const walk = name => {
    if (!fs.existsSync(name)) return;
    if (fs.statSync(name).isDirectory()) { for (const child of fs.readdirSync(name).sort()) walk(path.join(name, child)); return; }
    const relative = path.relative(root, name).replaceAll(path.sep, '/');
    if (/\.[jt]sx?$/.test(name) && !excluded.test(relative)) files.push(relative);
  };
  roots.forEach(name => walk(path.join(root, name)));
  return Object.fromEntries(files.map(file => [file, collectStyleLiterals(fs.readFileSync(path.join(root, file), 'utf8'), file)]).filter(([, values]) => Object.keys(values).length));
}
export function main(args = process.argv.slice(2)) {
  const current = scan();
  if (args.includes('--inventory')) { process.stdout.write(JSON.stringify({ description: 'Initial reviewed migration inventory. Do not regenerate to bypass failures. See DESIGN.md.', files: current }, null, 2) + '\n'); return; }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')).files;
  const errors = Object.entries(current).flatMap(([file, findings]) => introducedStyles(findings, baseline[file] || {}).map(([literal, count]) => `${file}: ${literal} (${count} occurrences; baseline ${baseline[file]?.[literal] || 0})`));
  if (errors.length) { process.stderr.write(`New design-system drift. Use @hashpass/ui tokens/primitives:\n${errors.join('\n')}\n`); process.exitCode = 1; }
  else console.log(`Design-system guard passed; ${Object.keys(current).length} legacy files remain in the migration inventory.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
