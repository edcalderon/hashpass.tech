/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div' },
  useInView: () => false,
}));

jest.mock('../../i18n/i18n', () => ({
  getCurrentLocale: () => 'en',
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('../../lib/api-client', () => ({
  apiClient: { post: jest.fn() },
  getCaptchaApiEndpoint: jest.fn(() => 'https://api.hashpass.tech/api/captcha/'),
}));

import Newsletter from '../../components/Newsletter.web';
import { getCaptchaApiEndpoint } from '../../lib/api-client';

const mockCaptchaEndpoint = getCaptchaApiEndpoint as jest.Mock;

type CapWidget = {
  addEventListener: jest.Mock;
  remove: jest.Mock;
  removeEventListener: jest.Mock;
  setAttribute: jest.Mock;
};

describe('Newsletter Cap widget', () => {
  const originalWindow = global.window;
  const originalDocument = global.document;
  const originalCustomElements = global.customElements;

  beforeEach(() => {
    mockCaptchaEndpoint.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(global, 'window', { configurable: true, value: originalWindow });
    Object.defineProperty(global, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(global, 'customElements', { configurable: true, value: originalCustomElements });
  });

  it('mounts Cap with the configured API endpoint instead of the static site origin', async () => {
    const widget: CapWidget = {
      addEventListener: jest.fn(),
      remove: jest.fn(),
      removeEventListener: jest.fn(),
      setAttribute: jest.fn(),
    };
    const capContainer = { appendChild: jest.fn() };

    Object.defineProperty(global, 'window', { configurable: true, value: {} });
    Object.defineProperty(global, 'customElements', {
      configurable: true,
      value: { get: () => ({}) },
    });
    Object.defineProperty(global, 'document', {
      configurable: true,
      value: { createElement: jest.fn(() => widget) },
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<Newsletter mode="light" />, {
        createNodeMock: () => capContainer,
      });
    });

    const emailInput = renderer.root.findByType('input');
    await act(async () => {
      emailInput.props.onChange({ target: { value: 'member@example.com' } });
      await Promise.resolve();
    });

    expect(mockCaptchaEndpoint).toHaveBeenCalledTimes(1);
    expect(widget.setAttribute).toHaveBeenCalledWith(
      'data-cap-api-endpoint',
      'https://api.hashpass.tech/api/captcha/',
    );
    expect(capContainer.appendChild).toHaveBeenCalledWith(widget);
  });
});
