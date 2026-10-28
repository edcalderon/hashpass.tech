/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockSolveLukasCaptcha = jest.fn();
const mockEarn = jest.fn();

jest.mock('@hashpass/ui/primitives', () => ({
  ActionButton: 'ActionButton',
  FilterChip: 'FilterChip',
  FormField: 'FormField',
  Surface: 'Surface',
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/hooks/useTheme', () => ({
  useTheme: () => ({ isDark: false }),
}), { virtual: true });
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/hooks/useIsMobile', () => ({
  useIsMobile: () => true,
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasGlyph', () => ({
  LukasGlyph: 'LukasGlyph',
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasRewards', () => ({
  useLukasRewards: () => ({ earn: (...args: unknown[]) => mockEarn(...args) }),
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/LukasCaptcha', () => ({
  LukasCaptcha: 'LukasCaptcha',
  solveLukasCaptcha: (...args: unknown[]) => mockSolveLukasCaptcha(...args),
}));

import { MerchantContactPanel } from '../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/MerchantContactPanel';

const renderPanel = () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<MerchantContactPanel />); });
  return renderer;
};

const field = (renderer: TestRenderer.ReactTestRenderer, label: string) =>
  renderer.root.findAllByType('FormField' as never).find((node) => node.props.label === label)!;

const fillValidForm = (renderer: TestRenderer.ReactTestRenderer) => {
  act(() => {
    field(renderer, 'Your name').props.onChangeText('Ada');
    field(renderer, 'Work email').props.onChangeText('ada@example.com');
    field(renderer, 'What would you like to enable?').props.onChangeText('Accept LUKAS at our shop.');
  });
};

describe('LUKAS merchant contact form feedback', () => {
  beforeEach(() => {
    mockSolveLukasCaptcha.mockReset().mockResolvedValue('programmatic-token');
    mockEarn.mockReset();
  });

  it('keeps the merchant form free of a visible CAPTCHA widget', () => {
    const renderer = renderPanel();

    expect(renderer.root.findAllByType('LukasCaptcha' as never)).toHaveLength(0);
    act(() => renderer.unmount());
  });

  it('shows actionable field errors when the form is submitted empty', async () => {
    const renderer = renderPanel();

    await act(async () => { await renderer.root.findByType('ActionButton' as never).props.onPress(); });

    expect(field(renderer, 'Your name').props.error).toBe('Enter your name.');
    expect(field(renderer, 'Work email').props.error).toBe('Enter your work email.');
    expect(field(renderer, 'What would you like to enable?').props.error).toBe('Add a short description.');
    act(() => renderer.unmount());
  });

  it('validates an email address after the field loses focus', () => {
    const renderer = renderPanel();
    const email = field(renderer, 'Work email');

    act(() => {
      email.props.onChangeText('not-an-email');
      email.props.onBlur?.();
    });

    expect(field(renderer, 'Work email').props.error).toBe('Enter a valid email address.');
    act(() => renderer.unmount());
  });

  it('submits a programmatically solved proof token to the merchant API', async () => {
    const renderer = renderPanel();
    fillValidForm(renderer);
    const originalFetch = global.fetch;
    const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    global.fetch = mockFetch as typeof fetch;

    try {
      await act(async () => { await renderer.root.findByType('ActionButton' as never).props.onPress(); });

      expect(mockSolveLukasCaptcha).toHaveBeenCalledTimes(1);
      expect(mockEarn).toHaveBeenCalledWith('merchant');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.hashpass.tech/api/lukas/merchant',
        expect.objectContaining({
          body: JSON.stringify({
            contactName: 'Ada',
            email: 'ada@example.com',
            merchantType: 'Coffee shop',
            description: 'Accept LUKAS at our shop.',
            bookingPreference: 'Book a call',
            captchaToken: 'programmatic-token',
          }),
        }),
      );
    } finally {
      global.fetch = originalFetch;
      act(() => renderer.unmount());
    }
  });

  it('shows an accessible recovery message when proof cannot be solved', async () => {
    const renderer = renderPanel();
    fillValidForm(renderer);
    mockSolveLukasCaptcha.mockRejectedValueOnce(new Error('The security check could not be completed. Please try again.'));
    const originalFetch = global.fetch;
    const mockFetch = jest.fn();
    global.fetch = mockFetch as typeof fetch;

    try {
      await act(async () => { await renderer.root.findByType('ActionButton' as never).props.onPress(); });

      const error = renderer.root.findAllByType('Text' as never).find((node) =>
        node.props.children === 'The security check could not be completed. Please try again.',
      );
      expect(error?.props.accessibilityRole).toBe('alert');
      expect(mockFetch).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
      act(() => renderer.unmount());
    }
  });

  it('announces merchant delivery errors and preserves entered values', async () => {
    const renderer = renderPanel();
    fillValidForm(renderer);
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Unable to send the merchant request right now.' }),
    }) as typeof fetch;

    try {
      await act(async () => { await renderer.root.findByType('ActionButton' as never).props.onPress(); });

      const error = renderer.root.findAllByType('Text' as never).find((node) =>
        node.props.children === 'Unable to send the merchant request right now.',
      );
      expect(error?.props.accessibilityRole).toBe('alert');
      expect(field(renderer, 'Your name').props.value).toBe('Ada');
      expect(field(renderer, 'Work email').props.value).toBe('ada@example.com');
    } finally {
      global.fetch = originalFetch;
      act(() => renderer.unmount());
    }
  });

  it('labels the busy action and success confirmation clearly', async () => {
    const renderer = renderPanel();
    fillValidForm(renderer);
    const originalFetch = global.fetch;
    let resolveProof!: (token: string) => void;
    mockSolveLukasCaptcha.mockReturnValueOnce(new Promise((resolve) => { resolveProof = resolve; }));
    let resolveResponse!: (response: Response) => void;
    global.fetch = jest.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; })) as typeof fetch;
    let submitPromise!: Promise<void>;

    try {
      await act(async () => {
        submitPromise = renderer.root.findByType('ActionButton' as never).props.onPress();
        await Promise.resolve();
      });
      expect(renderer.root.findByType('ActionButton' as never).props.label).toBe('Checking security…');
      expect(renderer.root.findAllByType('FormField' as never).every((control) => control.props.disabled)).toBe(true);
      expect(renderer.root.findAllByType('FilterChip' as never).every((control) => control.props.disabled)).toBe(true);

      await act(async () => {
        resolveProof('programmatic-token');
        await Promise.resolve();
      });
      expect(renderer.root.findByType('ActionButton' as never).props.label).toBe('Sending…');

      await act(async () => {
        resolveResponse({ ok: true, json: async () => ({ success: true }) } as Response);
        await submitPromise;
      });

      const confirmation = renderer.root.findAllByType('Text' as never).find((node) =>
        node.props.children === 'Request sent',
      );
      expect(confirmation?.props.role).toBe('status');
      expect(confirmation?.props.accessibilityLiveRegion).toBe('polite');
    } finally {
      global.fetch = originalFetch;
      act(() => renderer.unmount());
    }
  });
});
