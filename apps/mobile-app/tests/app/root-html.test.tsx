import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

jest.mock('expo-router/html', () => ({ ScrollViewStyleReset: () => null }));

import Root from '../../app/+html';

let view: ReactTestRenderer;

beforeEach(() => {
  process.env.EXPO_PUBLIC_SUPABASE_PROFILE = 'core-development';
});

afterEach(() => act(() => view?.unmount()));

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
