import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(await readFile(new URL('./work-plan.json', import.meta.url), 'utf8'));
const apply = process.argv.includes('--apply');
const origin = new URL(manifest.baseUrl);
if (origin.origin !== 'https://work.hashpass.tech') throw new Error('Unexpected Plane origin');
const workspace = process.env.PLANE_WORKSPACE_SLUG || manifest.workspace;
if (!/^[a-z0-9-]+$/.test(workspace)) throw new Error('Invalid workspace slug');
const nodes = [manifest.root, ...manifest.tasks];
const keys = new Set();
for (const node of nodes) {
  if (keys.has(node.key) || (node.parent && !keys.has(node.parent))) throw new Error(`Invalid task hierarchy: ${node.key}`);
  keys.add(node.key);
}
if (!apply) {
  console.log(JSON.stringify({ mode: 'dry-run', workspace, project: manifest.project, issues: nodes.map(({ key, parent, name, due }) => ({ key, parent, name, due })) }, null, 2));
  process.exit(0);
}
const token = process.env.PLANE_API_KEY;
if (!token) throw new Error('Set PLANE_API_KEY securely in cloud environment settings before --apply. No changes were made.');
const api = async (path, method = 'GET', body) => {
  const url = new URL(path, origin);
  if (url.origin !== origin.origin || !url.pathname.startsWith('/api/v1/')) throw new Error('Unsafe Plane API URL');
  const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'X-API-Key': token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`Plane ${method} failed (${response.status}). Check workspace access; credentials and response bodies are not logged.`);
  return response.json();
};
const all = async path => {
  const rows = []; let cursor = '';
  do {
    const data = await api(`${path}?per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    rows.push(...(Array.isArray(data) ? data : data.results || []));
    cursor = !Array.isArray(data) && data.next_page_results ? data.next_cursor : '';
  } while (cursor);
  return rows;
};
// Authenticate and discover the workspace before any mutation.
await api('/api/v1/users/me/');
const base = `/api/v1/workspaces/${workspace}/projects/`;
const matches = (await all(base)).filter(p => p.identifier === manifest.project.identifier);
if (matches.length > 1) throw new Error('Ambiguous project identifier; no changes made');
const project = matches[0] || await api(base, 'POST', { name: manifest.project.name, identifier: manifest.project.identifier, description: 'BSL Colombia 2026 launch campaign and reusable HASHPASS marketing platform. GitHub: https://github.com/hashpass-tech/hashpass.tech/issues/424' });
const existing = await all(`${base}${project.id}/issues/`);
const ids = new Map(); const output = [];
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
for (const node of nodes) {
  const marker = `hashpass-campaign:bsl2026:${node.key}`;
  const found = existing.filter(issue => (issue.description_html || '').includes(marker));
  if (found.length > 1) throw new Error(`Duplicate import marker: ${node.key}`);
  const issue = found[0] || await api(`${base}${project.id}/issues/`, 'POST', {
    name: node.name, parent: node.parent ? ids.get(node.parent) : null, target_date: node.due,
    description_html: `<p>${marker}</p><p>Owner role: ${escape(node.ownerRole || 'Campaign lead')}</p><p>${escape(node.description || '')}</p><p>Dependencies: ${(node.dependsOn || []).map(escape).join(', ') || 'None'}</p><ul>${(node.acceptance || []).map(item => `<li>${escape(item)}</li>`).join('')}</ul><p>Follow-up: report evidence, blockers and completion in this issue. Parent campaign: <a href="https://github.com/hashpass-tech/hashpass.tech/issues/424">GitHub #424</a>.</p>`,
  });
  ids.set(node.key, issue.id);
  output.push({ key: node.key, id: issue.id, url: `${origin.origin}/${workspace}/projects/${project.id}/issues/${issue.id}` });
  console.log(`${found[0] ? 'Existing' : 'Created'}: ${node.key}`);
}
const outputPath = fileURLToPath(new URL('./plane-import-result.json', import.meta.url));
await writeFile(outputPath, JSON.stringify({ projectId: project.id, issues: output }, null, 2) + '\n');
console.log(`Plane project ${manifest.project.identifier}: ${output.length} issues reconciled.`);
