/// <reference types="jest" />

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
    '/sw.js',
    '/favicon.ico',
  ])('keeps the real asset %s on its requested path', (uri) => {
    expect(applyViewerRequestRewrite(uri)).toBe(uri);
  });
});
