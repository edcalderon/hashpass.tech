/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Linking, Platform } from 'react-native';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';

const mockTheme = { isDark: false };
const mockViewport = { isMobile: true };

jest.mock('@hashpass/ui/primitives', () => ({
  ActionButton: 'ActionButton',
  FormField: 'FormField',
  Surface: 'Surface',
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/hooks/useTheme', () => ({
  useTheme: () => mockTheme,
}), { virtual: true });
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/hooks/useIsMobile', () => ({
  useIsMobile: () => mockViewport.isMobile,
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/i18n/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) => key === 'getLukas.exploreTestnet' ? 'Keep exploring the LUKAS testnet' : key,
  }),
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasGlyph', () => ({
  LukasGlyph: 'LukasGlyph',
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/LukasRewards', () => ({
  useLukasRewards: () => ({ earn: jest.fn() }),
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/LukasCaptcha', () => ({
  LukasCaptcha: 'LukasCaptcha',
}));
jest.mock('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/lukas-ui', () => ({
  ...jest.requireActual('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/lukas-ui'),
  LukasDialog: () => null,
}));

import { GetLukasSection } from '../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/lukas/GetLukasSection';

const renderSection = () => {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<GetLukasSection />); });
  return renderer;
};

const getTestnetPanel = (renderer: TestRenderer.ReactTestRenderer) =>
  renderer.root.findAllByType('Surface' as never).find((surface) =>
    surface.findAllByType('Text' as never).some((text) => text.props.children === 'LUKAS $LKS · Testnet until TGE'),
  );

const originalPlatformOS = Platform.OS;
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

describe('LUKAS testnet CTA', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it.each([
    ['light mobile', false, true, 'stretch'],
    ['dark mobile', true, true, 'stretch'],
    ['light desktop', false, false, 'center'],
    ['dark desktop', true, false, 'center'],
  ] as const)('places one premium CTA in the existing TGE panel in %s', (_viewport, isDark, isMobile, alignment) => {
    mockTheme.isDark = isDark;
    mockViewport.isMobile = isMobile;
    const mode = isDark ? 'dark' : 'light';
    const renderer = renderSection();
    const panel = getTestnetPanel(renderer);

    expect(panel).toBeDefined();
    expect(panel?.findAllByType('Text' as never).map((text) => text.props.children)).toContain(
      'Stay listed for airdrops, prizes, and launch pricing.',
    );
    expect(panel?.findAllByType('ActionButton' as never)).toHaveLength(1);

    const button = panel!.findByType('ActionButton' as never);
    expect(button.props.label).toBe('Keep exploring the LUKAS testnet');
    expect(button.props.skin).toMatchObject({
      fill: uiPalette(mode).vipFill,
      onFill: uiPalette(mode).onVip,
    });
    expect(button.props.style).toMatchObject({
      alignSelf: alignment,
      marginTop: uiTokens.space.md,
    });

    act(() => renderer.unmount());
  });

  it('opens the approved LUKAS destination with native Linking when the CTA is pressed', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    openURL.mockClear();
    const renderer = renderSection();
    const button = getTestnetPanel(renderer)!.findByType('ActionButton' as never);

    await act(async () => { await button.props.onPress(); });

    expect(openURL).toHaveBeenCalledWith('https://lukas.lat');
    act(() => renderer.unmount());
  });

  it('navigates the current browser tab on web', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const assign = jest.fn();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { assign } },
    });
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    openURL.mockClear();
    const renderer = renderSection();
    const button = getTestnetPanel(renderer)!.findByType('ActionButton' as never);

    await act(async () => { await button.props.onPress(); });

    expect(assign).toHaveBeenCalledWith('https://lukas.lat');
    expect(openURL).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });
});
