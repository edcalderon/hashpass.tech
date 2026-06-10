/// <reference types="jest" />

import {
  getAvailableEvents,
  getCurrentEvent,
  getEventTenantContext,
  getRouteEventIdFromPathname,
  isGlobalEventTenant,
} from '../../lib/event-detector';

const envBackup: Record<string, string | undefined> = {};

const setEnv = (name: string, value?: string) => {
  if (!(name in envBackup)) {
    envBackup[name] = process.env[name];
  }

  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
};

const restoreEnv = () => {
  for (const [name, value] of Object.entries(envBackup)) {
    if (typeof value === 'string') {
      process.env[name] = value;
    } else {
      delete process.env[name];
    }
  }

  for (const key of Object.keys(envBackup)) {
    delete envBackup[key];
  }
};

afterEach(() => {
  restoreEnv();
});

describe('event tenant detection', () => {
  it('treats hashpass.tech as the global HashPass event explorer', () => {
    const tenant = getEventTenantContext('hashpass.tech');
    const events = getAvailableEvents('hashpass.tech').map(event => event.id);

    expect(tenant.id).toBe('main');
    expect(tenant.showAllEvents).toBe(true);
    expect(isGlobalEventTenant('hashpass.tech')).toBe(true);
    expect(events).toEqual(['bsl', 'peru2026', 'chile2026', 'colombia2026', 'bsl2025']);
  });

  it('scopes bsl.hashpass.tech to the BSL event family via shared tenant config', () => {
    setEnv('EXPO_PUBLIC_EVENT_TENANT', 'main');

    const tenant = getEventTenantContext('bsl.hashpass.tech');
    const events = getAvailableEvents('bsl.hashpass.tech').map(event => event.id);

    expect(tenant.id).toBe('bsl');
    expect(tenant.source).toBe('config');
    expect(tenant.showAllEvents).toBe(false);
    expect(events).toEqual(['bsl', 'peru2026', 'chile2026', 'colombia2026', 'bsl2025']);
  });

  it('scopes bsl2025.hashpass.tech to the BSL 2025 event family via shared tenant config', () => {
    setEnv('EXPO_PUBLIC_EVENT_TENANT', 'main');

    const tenant = getEventTenantContext('bsl2025.hashpass.tech');
    const events = getAvailableEvents('bsl2025.hashpass.tech').map(event => event.id);

    expect(tenant.id).toBe('bsl2025');
    expect(tenant.source).toBe('config');
    expect(tenant.showAllEvents).toBe(false);
    expect(events).toEqual(['bsl2025']);
  });

  it('can test the BSL tenant on localhost with EXPO_PUBLIC_EVENT_TENANT', () => {
    setEnv('EXPO_PUBLIC_EVENT_TENANT', 'bsl');

    const tenant = getEventTenantContext('localhost');
    const events = getAvailableEvents('localhost').map(event => event.id);

    expect(tenant.id).toBe('bsl');
    expect(tenant.source).toBe('env-tenant');
    expect(events).toEqual(['bsl', 'peru2026', 'chile2026', 'colombia2026', 'bsl2025']);
  });

  it('supports exact local event filtering with EXPO_PUBLIC_EVENT_IDS', () => {
    setEnv('EXPO_PUBLIC_EVENT_TENANT', 'main');
    setEnv('EXPO_PUBLIC_EVENT_IDS', 'bsl2025');

    const tenant = getEventTenantContext('localhost:8081');
    const events = getAvailableEvents('localhost:8081').map(event => event.id);

    expect(tenant.source).toBe('env-event-ids');
    expect(events).toEqual(['bsl2025']);
    expect(getCurrentEvent('bsl', 'localhost:8081')).toBeNull();
    expect(getCurrentEvent('bsl2025', 'localhost:8081')?.id).toBe('bsl2025');
  });

  it('resolves route slugs to event ids for route-aware event pages', () => {
    expect(getRouteEventIdFromPathname('/events/peru2026/agenda')).toBe('peru2026');
    expect(getRouteEventIdFromPathname('/events/chile2026/speakers/calendar')).toBe('chile2026');
  });
});
