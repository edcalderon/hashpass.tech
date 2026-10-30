/// <reference types="jest" />

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BSL_SPA_FALLBACK_REWRITE } from '../src/domains';

type ViewerRequest = {
  request: {
    uri: string;
  };
};

const applyViewerRequestRewrite = (uri: string): string => {
  const event: ViewerRequest = { request: { uri } };
  // SST injects this source inside its viewer-request handler. Execute the
  // exact same source here so a change cannot reintroduce deep-link 404s.
  new Function('event', BSL_SPA_FALLBACK_REWRITE)(event);
  return event.request.uri;
};

describe('BSL SPA viewer-request fallback', () => {
  it.each(['/home', '/dashboard/explore', '/auth/sign-in', '/events/chile2026/agenda'])
    ('rewrites the application route %s to the static entry point', (uri) => {
      expect(applyViewerRequestRewrite(uri)).toBe('/index.html');
    });

  it.each([
    '/_expo/static/js/web/index-current.js',
    '/assets/logo.png',
    '/config/versions.json',
    '/manifest.json',
    '/manifest.webmanifest',
    '/sw.js',
    '/favicon.ico',
  ])('keeps the real asset %s on its requested path', (uri) => {
    expect(applyViewerRequestRewrite(uri)).toBe(uri);
  });
});

const SHARE_ID = 'a'.repeat(43);

describe('BSL artwork share routing', () => {
  const standalone = readFileSync(join(__dirname, '../cloudfront/bsl-artwork-share-redirect.js'), 'utf8');
  const runStandalone = (host: string, uri: string): any =>
    new Function(`${standalone}; return handler;`)()({ request: { uri, headers: { host: { value: host } } } });
  const runInjected = (host: string, uri: string): any => {
    const event = { request: { uri, headers: { host: { value: host } } } };
    return { event, result: new Function('event', BSL_SPA_FALLBACK_REWRITE)(event) };
  };

  it.each([
    ['bsl.hashpass.tech', `/attending/bsl/a/${SHARE_ID}`, `https://hpass.id/a/${SHARE_ID}`],
    ['bsl.hashpass.tech', `/attending/bsl/a/${SHARE_ID}/image`, `https://hpass.id/a/${SHARE_ID}/image`],
    ['bsl-dev.hashpass.tech', `/attending/bsl/a/${SHARE_ID}/image`, `https://dev.hashpass.link/a/${SHARE_ID}/image`],
  ])('redirects %s %s to the links API in both routing sources', (host, uri, location) => {
    for (const response of [runStandalone(host, uri), runInjected(host, uri).result]) {
      expect(response.statusCode).toBe(302);
      expect(response.headers.location.value).toBe(location);
    }
  });

  it.each([
    ['bsl.hashpass.tech', '/'],
    ['bsl.hashpass.tech', '/attending/bsl'],
    ['bsl.hashpass.tech', '/attending/bsl/a/short'],
    ['other.hashpass.tech', `/attending/bsl/a/${SHARE_ID}`],
  ])('passes %s %s through unchanged', (host, uri) => {
    const request = { uri, headers: { host: { value: host } } };
    expect(new Function(`${standalone}; return handler;`)()({ request })).toBe(request);
  });
});
