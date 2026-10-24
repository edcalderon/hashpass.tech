import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable, TextInput } from 'react-native';

jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: {
  primary: '#a00', divider: '#ddd', background: { paper: '#fafafa', default: '#fff' },
  text: { primary: '#111', secondary: '#555' },
} }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
// DrawerSheet reads both motion preferences; the app-level one comes from this provider.
let mockAnimations = true;
jest.mock('../../providers/AnimationProvider', () => ({
  useAnimations: () => ({ animationsEnabled: mockAnimations, setAnimationsEnabled: jest.fn(), isReady: true }),
}));
import WalletHelpDrawer from '../../components/wallet/WalletHelpDrawer';

const search = (view: ReactTestRenderer, text: string) => {
  const input = view.root.findByType(TextInput);
  act(() => input.props.onChangeText(text));
};
const rendered = (view: ReactTestRenderer) => JSON.stringify(view.toJSON());
/** The drawer's expandable items: every question currently rendered as an item button. */
const items = (view: ReactTestRenderer) => view.root.findAllByType(Pressable)
  .filter(node => node.props.accessibilityRole === 'button' && node.props.accessibilityState && 'expanded' in node.props.accessibilityState);

describe('wallet help drawer', () => {
  it('searches semantically: a synonym ("password") finds the PIN answer, junk finds nothing', () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<WalletHelpDrawer open onClose={() => {}} />); });
    // "password" never appears in the PIN entry; the synonym map must find it.
    search(view, 'password');
    expect(rendered(view)).toContain('What does the 4-digit PIN do?');
    expect(items(view).length).toBeGreaterThan(0);
    search(view, 'lost backup');
    expect(rendered(view)).toContain('What is the recovery phrase?');
    search(view, 'xyzzy plugh');
    expect(rendered(view)).toContain('Nothing matched');
    act(() => view.unmount());
  });

  it('expands an answer in place and switches categories with tabs', () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<WalletHelpDrawer open onClose={() => {}} />); });
    const first = items(view)[0];
    act(() => first.props.onPress());
    expect(first.props.accessibilityState.expanded).toBe(true);
    const tabs = view.root.findAllByType(Pressable).filter(node => node.props.accessibilityRole === 'tab');
    expect(tabs.length).toBe(4);
    act(() => tabs[3].props.onPress());
    expect(rendered(view)).toContain('How do I get help?');
    act(() => view.unmount());
  });

  it('opens with the app animations disabled: the sheet appears at once, no movement', () => {
    mockAnimations = false;
    let view!: ReactTestRenderer;
    try {
      act(() => { view = create(<WalletHelpDrawer open onClose={() => {}} />); });
      // The entrance lands on the visible endpoints immediately; the sheet is fully usable.
      expect(rendered(view)).toContain('Who controls my assets?');
      const first = items(view)[0];
      act(() => first.props.onPress());
      expect(first.props.accessibilityState.expanded).toBe(true);
    } finally {
      mockAnimations = true;
      if (view) act(() => view.unmount());
    }
  });
});
