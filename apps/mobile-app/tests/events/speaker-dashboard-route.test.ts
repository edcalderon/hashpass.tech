/// <reference types="jest" />

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockRedirect = jest.fn((_props: unknown) => null);

jest.mock('expo-router', () => ({
  Redirect: (props: unknown) => mockRedirect(props),
  useLocalSearchParams: () => ({ eventSlug: 'chile2026' }),
}));

const dashboardRoutePath = resolve(
  __dirname,
  '../../app/events/[eventSlug]/speakers/dashboard.tsx',
);

describe('speaker dashboard route', () => {
  it('redirects the dashboard URL to the speaker request-management screen', () => {
    const routeExists = existsSync(dashboardRoutePath);

    expect(routeExists).toBe(true);
    if (!routeExists) return;

    const SpeakerDashboard = require('../../app/events/[eventSlug]/speakers/dashboard').default;

    act(() => {
      TestRenderer.create(React.createElement(SpeakerDashboard));
    });

    expect(mockRedirect).toHaveBeenCalledWith({
      href: {
        pathname: '/events/[eventSlug]/networking/my-requests',
        params: { eventSlug: 'chile2026' },
      },
    });
  });
});
