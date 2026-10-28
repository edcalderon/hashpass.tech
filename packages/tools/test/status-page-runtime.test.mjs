import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPreferences,
  readPreferences,
  startStatusDashboard,
  updateMetricTargets,
} from '../../../apps/status-page/src/status-page.mjs';

const storage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
};

test('status preferences persist theme, density, and focus with safe defaults', () => {
  const saved = storage({ 'hashpass-status-settings': JSON.stringify({ theme: 'dark', density: 'compact', focus: true }) });
  assert.deepEqual(readPreferences(saved), { theme: 'dark', density: 'compact', focus: true });
  assert.deepEqual(readPreferences(storage({ 'hashpass-status-settings': '{bad' })), { theme: 'system', density: 'comfortable', focus: false });
});

test('appearance preferences update semantic document state', () => {
  const root = { dataset: {} };
  applyPreferences(root, { theme: 'light', density: 'compact', focus: true });
  assert.deepEqual(root.dataset, { theme: 'light', density: 'compact', focus: 'true' });
});

test('live aggregates update only declared metric targets', () => {
  const nodes = new Map(['users-total', 'users-active30d', 'users-new7d', 'events-total', 'events-published', 'passes-active', 'passes-total', 'meetings-scheduled', 'meetings-total', 'surfaces-up', 'incidents-active'].map((key) => [key, { textContent: '—' }]));
  const surfaceNode = { textContent: '🔴 down', dataset: {}, style: {} };
  const document = {
    querySelector: (selector) => nodes.get(selector.match(/"([^"]+)"/)?.[1]) ?? null,
    querySelectorAll: (selector) => selector === '[data-surface-status="API"]' ? [surfaceNode] : [],
  };
  updateMetricTargets(document, {
    users: { total: 1200, active30d: 345, new7d: 67 },
    events: { total: 8, published: 5 },
    passes: { active: 910, total: 1000 },
    meetings: { scheduled: 31, total: 45 },
    operations: { up: 2, total: 3, incidents: [{ name: 'API' }], surfaces: [{ name: 'API', up: false }] },
    privateEmail: 'must-not-render@example.com',
  });
  assert.equal(nodes.get('users-total').textContent, '1.2K');
  assert.equal(nodes.get('users-active30d').textContent, '345');
  assert.equal(nodes.get('meetings-scheduled').textContent, '31');
  assert.equal(nodes.get('events-published').textContent, '5');
  assert.equal(nodes.get('passes-total').textContent, '1K');
  assert.equal(nodes.get('meetings-total').textContent, '45');
  assert.equal(nodes.get('surfaces-up').textContent, '2 / 3');
  assert.equal(nodes.get('incidents-active').textContent, '1');
  assert.equal(surfaceNode.textContent, '🔴 down');
  assert.equal(surfaceNode.dataset.health, 'down');
  assert.equal(surfaceNode.style.background, 'var(--editor-colors-pink-background)');
});

test('a failed refresh keeps the last successful values and marks the dashboard stale', async () => {
  const metric = { textContent: '—' };
  const sync = { textContent: '' };
  const live = { textContent: '' };
  const root = { dataset: {} };
  const document = {
    documentElement: root,
    querySelectorAll: (selector) => selector === '[data-sync-status]' ? [sync] : [],
    querySelector: (selector) => {
      if (selector === '[data-sync-status]') return sync;
      if (selector === '[data-live-announcer]') return live;
      if (selector === '[data-metric="users-total"]') return metric;
      return null;
    },
  };
  let succeeds = true;
  const stop = startStatusDashboard({
    document,
    storage: storage(),
    fetch: async () => {
      if (!succeeds) throw new Error('offline');
      return Response.json({data: {generatedAt: new Date().toISOString(), users: {total: 42}}});
    },
    timers: { setInterval: () => 1, clearInterval: () => {} },
    autoRefresh: false,
  });
  await stop.refresh();
  assert.equal(metric.textContent, '42');
  succeeds = false;
  await stop.refresh();
  assert.equal(metric.textContent, '42');
  assert.equal(root.dataset.sync, 'stale');
  assert.match(sync.textContent, /Offline/);
});
