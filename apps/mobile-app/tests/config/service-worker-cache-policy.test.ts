/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const serviceWorkerSource = fs.readFileSync(
  path.resolve(__dirname, '../../public/sw.js'),
  'utf8',
);

describe('PWA service worker cache policy', () => {
  it('never serves release metadata from cache', () => {
    expect(serviceWorkerSource).toContain('/config/versions.json');
    expect(serviceWorkerSource).toContain('/config/version.production.json');
    expect(serviceWorkerSource).toContain('/config/version.development.json');
    expect(serviceWorkerSource).toContain('/config/update-policy.json');
    expect(serviceWorkerSource).toContain("url.pathname === '/sw.js'");
    expect(serviceWorkerSource).toContain("fetch(request, { cache: 'no-store' })");
  });

  it('checks the network before cached app runtime assets', () => {
    expect(serviceWorkerSource).toContain("const fetchFresh = (request) => fetch(request, { cache: 'no-cache' })");
    expect(serviceWorkerSource).toContain("request.destination === 'script'");
    expect(serviceWorkerSource).toContain("request.destination === 'style'");
    expect(serviceWorkerSource).toContain("url.pathname === '/manifest.json'");
  });
});
