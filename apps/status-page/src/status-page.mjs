const SETTINGS_KEY = 'hashpass-status-settings';
const VALID_THEME = new Set(['system', 'light', 'dark']);
const VALID_DENSITY = new Set(['comfortable', 'compact']);

export function readPreferences(storage = globalThis.localStorage) {
  const fallback = { theme: 'system', density: 'comfortable', focus: false };
  try {
    const saved = JSON.parse(storage?.getItem(SETTINGS_KEY) || '{}');
    return {
      theme: VALID_THEME.has(saved.theme) ? saved.theme : fallback.theme,
      density: VALID_DENSITY.has(saved.density) ? saved.density : fallback.density,
      focus: saved.focus === true,
    };
  } catch {
    return fallback;
  }
}

export function applyPreferences(root, preferences) {
  root.dataset.theme = preferences.theme;
  root.dataset.density = preferences.density;
  root.dataset.focus = String(preferences.focus);
}

export function savePreferences(storage, preferences) {
  storage?.setItem(SETTINGS_KEY, JSON.stringify(preferences));
}

export function compactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('en', {
    notation: number >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: number >= 1000 ? 1 : 0,
  }).format(number);
}

export function updateMetricTargets(document, metrics) {
  const values = {
    'users-total': metrics?.users?.total,
    'users-active30d': metrics?.users?.active30d,
    'users-new7d': metrics?.users?.new7d,
    'activity-verified30d': metrics?.activity?.verified30d,
    'events-total': metrics?.events?.total,
    'events-published': metrics?.events?.published,
    'passes-active': metrics?.passes?.active,
    'passes-total': metrics?.passes?.total,
    'meetings-scheduled': metrics?.meetings?.scheduled,
    'meetings-total': metrics?.meetings?.total,
    'surfaces-up': metrics?.operations ? `${metrics.operations.up} / ${metrics.operations.total}` : undefined,
    'incidents-active': metrics?.operations?.incidents?.length,
  };
  for (const [key, value] of Object.entries(values)) {
    const target = document.querySelector(`[data-metric="${key}"]`);
    if (target && value !== undefined) target.textContent = typeof value === 'string' ? value : compactNumber(value);
  }

  const headline = document.querySelector('[data-operational-headline]');
  const detail = document.querySelector('[data-operational-detail]');
  if (headline && metrics?.operations) {
    const incidents = metrics.operations.incidents || [];
    headline.textContent = incidents.length ? `${incidents.length} surface${incidents.length === 1 ? '' : 's'} need attention` : 'All monitored systems operational';
    if (detail) detail.textContent = incidents.length ? `Affected: ${incidents.map((incident) => incident.name).join(', ')}.` : 'No active incidents detected across the monitored platform.';
  }

  for (const surface of metrics?.operations?.surfaces || []) {
    const targets = document.querySelectorAll(`[data-surface-status="${surface.name}"]`);
    for (const target of targets) {
      target.textContent = surface.up ? '🟢 up' : '🔴 down';
      target.dataset.health = surface.up ? 'up' : 'down';
      target.style.background = surface.up ? 'var(--editor-colors-green-background)' : 'var(--editor-colors-pink-background)';
    }
  }

  for (const [key, series] of Object.entries({ 'active-users7d': metrics?.trends?.activeUsers7d, 'new-users7d': metrics?.trends?.newUsers7d })) {
    const target = document.querySelector(`[data-trend="${key}"]`);
    if (!target || !Array.isArray(series) || typeof document.createElement !== 'function') continue;
    const maximum = Math.max(1, ...series.map(Number));
    target.replaceChildren(...series.map((value) => {
      const bar = document.createElement('span');
      bar.style.setProperty('--trend', `${Math.max(8, Math.round(Number(value) / maximum * 100))}%`);
      return bar;
    }));
    target.setAttribute('aria-label', `Seven day trend: ${series.join(', ')}`);
  }
}

function bindSettings(document, storage) {
  const root = document.documentElement;
  let preferences = readPreferences(storage);
  applyPreferences(root, preferences);

  for (const input of document.querySelectorAll('#status-settings input')) {
    if (input.name === 'theme') input.checked = input.value === preferences.theme;
    if (input.name === 'density') input.checked = input.value === preferences.density;
    if (input.name === 'focus') input.checked = preferences.focus;
    input.addEventListener('change', () => {
      const form = new FormData(document.querySelector('#status-settings form'));
      preferences = {
        theme: String(form.get('theme') || 'system'),
        density: String(form.get('density') || 'comfortable'),
        focus: form.get('focus') === 'on',
      };
      applyPreferences(root, preferences);
      savePreferences(storage, preferences);
    });
  }
}

function relativeAge(iso, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

export function startStatusDashboard({ document, storage, fetch: fetchImpl, interval = 60_000, timers = globalThis, autoRefresh = true } = {}) {
  bindSettings(document, storage);
  const syncTargets = document.querySelectorAll('[data-sync-status]');
  const liveRegion = document.querySelector('[data-live-announcer]');
  let lastSuccess = null;

  const refresh = async () => {
    document.documentElement.dataset.sync = 'loading';
    for (const sync of syncTargets) sync.textContent = 'Syncing…';
    try {
      const response = await fetchImpl('/status/metrics', { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      updateMetricTargets(document, body.data);
      lastSuccess = body.meta?.lastSuccessfulSync || body.data?.generatedAt || new Date().toISOString();
      const stale = body.meta?.stale === true;
      document.documentElement.dataset.sync = stale ? 'stale' : 'live';
      for (const sync of syncTargets) sync.textContent = stale ? `Stale · last synced ${relativeAge(lastSuccess)}` : `Live · synced ${relativeAge(lastSuccess)}`;
      if (liveRegion) liveRegion.textContent = stale ? 'Live metrics are temporarily stale.' : 'Mission Control metrics updated.';
    } catch {
      document.documentElement.dataset.sync = 'stale';
      for (const sync of syncTargets) sync.textContent = lastSuccess ? `Offline · last synced ${relativeAge(lastSuccess)}` : 'Live metrics unavailable';
      if (liveRegion) liveRegion.textContent = 'Live metrics could not refresh. The last successful values remain visible.';
    }
  };

  if (autoRefresh) void refresh();
  const timer = timers.setInterval(refresh, interval);
  const stop = () => timers.clearInterval(timer);
  stop.refresh = refresh;
  return stop;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  startStatusDashboard({ document, storage: window.localStorage, fetch: window.fetch.bind(window), timers: window });
}
