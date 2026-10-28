import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router/html', () => ({ ScrollViewStyleReset: () => null }));

import Root from '../../app/+html';

let view: ReactTestRenderer;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_PROFILE = 'core-development';
});

afterEach(() => {
  act(() => view?.unmount());
  delete process.env.EXPO_PUBLIC_CIG_ANALYTICS_SITE_ID;
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  delete process.env.EXPO_PUBLIC_API_TARGET;
});

/** Renders the root document and runs its inline runtime-config script against a fake window. */
const runRuntimeScript = (hostname: string, origin: string) => {
  act(() => {
    view = create(<Root><main>HASHPASS</main></Root>);
  });
  const script = view.root
    .findAllByType('script')
    .map(node => node.props.dangerouslySetInnerHTML?.__html as string | undefined)
    .find(html => html?.includes('window.__API_BASE_URL__ ='));
  const fakeWindow: Record<string, any> = { location: { hostname, origin, protocol: new URL(origin).protocol } };
  new Function('window', script as string)(fakeWindow);
  return fakeWindow;
};

it('publishes a mobile PWA viewport without disabling browser zoom', () => {
  act(() => {
    view = create(<Root><main>HASHPASS</main></Root>);
  });

  const viewport = view.root.findAllByType('meta').find(node => node.props.name === 'viewport');
  expect(viewport?.props.content).toBe(
    'width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content'
  );
  expect(viewport?.props.content).not.toContain('user-scalable=no');
});

it('opts out of browser auto-translation that detaches React-managed DOM nodes', () => {
  act(() => {
    view = create(<Root><main>HASHPASS</main></Root>);
  });

  const html = view.root.findByType('html');
  expect(html.props.translate).toBe('no');
  expect(html.props.className).toContain('notranslate');
  const googleMeta = view.root.findAllByType('meta').find(node => node.props.name === 'google');
  expect(googleMeta?.props.content).toBe('notranslate');
});

it('allows route metadata to override the fallback viewport', () => {
  act(() => {
    view = create(
      <Root metadata={{ viewport: 'width=720', title: 'Event' }}>
        <main>Event</main>
      </Root>
    );
  });

  const viewport = view.root.findAllByType('meta').find(node => node.props.name === 'viewport');
  expect(viewport?.props.content).toBe('width=720');
  expect(view.root.findByType('title').props.children).toBe('Event');
});

it('omits the cig.technology tracker when EXPO_PUBLIC_CIG_ANALYTICS_SITE_ID is unset', () => {
  act(() => {
    view = create(<Root><main>HASHPASS</main></Root>);
  });

  const scripts = view.root.findAllByType('script');
  expect(scripts.some(node => typeof node.props.src === 'string' && node.props.src.includes('cig.technology'))).toBe(false);
});

it('injects the cig.technology tracker when EXPO_PUBLIC_CIG_ANALYTICS_SITE_ID is set', () => {
  process.env.EXPO_PUBLIC_CIG_ANALYTICS_SITE_ID = 'site_-dCPyOHCCE8im_ht';

  act(() => {
    view = create(<Root><main>HASHPASS</main></Root>);
  });

  const tracker = view.root
    .findAllByType('script')
    .find(node => typeof node.props.src === 'string' && node.props.src.includes('cig.technology'));

  expect(tracker?.props.src).toBe(
    'https://api.cig.technology/api/v1/analytics/tracker.js?site=site_-dCPyOHCCE8im_ht'
  );
  expect(tracker?.props['data-site']).toBe('site_-dCPyOHCCE8im_ht');
  expect(tracker?.props.defer).toBe(true);
});

describe('inline API base URL', () => {
  const pinned = 'https://api-dev.hashpass.tech/api';

  it('keeps localhost on its own /api routes even when a deployed base is pinned', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = pinned;
    const win = runRuntimeScript('localhost', 'http://localhost:8081');
    expect(win.__API_BASE_URL__).toBe('http://localhost:8081/api');
    expect(win.__BETTER_AUTH_URL__).toBe('http://localhost:8081/api/auth');
  });

  it.each([
    ['dev', 'https://api-dev.hashpass.tech/api'],
    ['prod', 'https://api.hashpass.tech/api'],
  ])('points localhost at the %s Lambda when EXPO_PUBLIC_API_TARGET opts in', (target, expected) => {
    process.env.EXPO_PUBLIC_API_BASE_URL = pinned;
    process.env.EXPO_PUBLIC_API_TARGET = target;
    expect(runRuntimeScript('localhost', 'http://localhost:8081').__API_BASE_URL__).toBe(expected);
  });

  it('uses the pinned base on a deployed host', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = pinned;
    expect(runRuntimeScript('hashpass.tech', 'https://hashpass.tech').__API_BASE_URL__).toBe(pinned);
  });

  it('keeps an Expo LAN origin on its same-origin API in local development', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = pinned;
    process.env.EXPO_PUBLIC_ENV = 'local';
    expect(runRuntimeScript('192.168.1.20', 'http://192.168.1.20:8081').__API_BASE_URL__).toBe(
      'http://192.168.1.20:8081/api'
    );
    delete process.env.EXPO_PUBLIC_ENV;
  });

  it('falls back to the production API on a deployed host with nothing pinned', () => {
    expect(runRuntimeScript('hashpass.tech', 'https://hashpass.tech').__API_BASE_URL__).toBe('https://api.hashpass.tech/api');
  });
});
