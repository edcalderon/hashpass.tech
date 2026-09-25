import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

let mockDark = false;
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: mockDark }) }));

import DesignSystemStyles from '../../components/DesignSystemStyles.web';

let view: ReactTestRenderer;

afterEach(() => {
  act(() => view?.unmount());
  mockDark = false;
});

it('stabilizes mobile layout and form zoom while keeping reduced motion support', () => {
  act(() => { view = create(<DesignSystemStyles />); });
  const css = view.root.findByType('style').props.children as string;

  expect(css).toContain('min-height: 100dvh');
  expect(css).toContain('overflow-x: hidden; overflow-x: clip');
  expect(css).toContain('-webkit-text-size-adjust: 100%');
  expect(css).toContain('font-size: max(16px, 1em)');
  expect(css).toContain('prefers-reduced-motion: reduce');
});

it('updates the browser color scheme with the app theme', () => {
  mockDark = true;
  act(() => { view = create(<DesignSystemStyles />); });
  expect(view.root.findByType('style').props.children).toContain('color-scheme: dark');
});
