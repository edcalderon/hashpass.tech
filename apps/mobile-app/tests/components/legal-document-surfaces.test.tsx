import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Dimensions } from 'react-native';
import PrivacyPolicyScreen from '../../app/(shared)/privacy';
import TermsOfServiceScreen from '../../app/(shared)/terms';
import PrivacyTermsModal from '../../components/PrivacyTermsModal';

const mockRouter = {
  canGoBack: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
};

let mockTheme = {
  isDark: false,
  colors: {
    background: { default: '#ffffff' },
    text: { primary: '#111111' },
    divider: '#dddddd',
  },
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@hashpass/ui/primitives', () => ({ ModalBackdrop: 'ModalBackdrop' }));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('../../components/LegalDocumentContent', () => 'LegalDocumentContent');
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => mockTheme }));
jest.mock('../../i18n/i18n', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

let view: ReactTestRenderer | undefined;

const rendered = (): ReactTestRenderer => {
  if (!view) throw new Error('Expected the legal surface to be rendered.');
  return view;
};

const findHost = (type: string) =>
  rendered().root.find((node) => node.type === type);

beforeEach(() => {
  jest.mocked(Dimensions.addEventListener).mockClear();
  mockRouter.canGoBack.mockReset();
  mockRouter.back.mockReset();
  mockRouter.replace.mockReset();
  mockTheme = {
    isDark: false,
    colors: {
      background: { default: '#ffffff' },
      text: { primary: '#111111' },
      divider: '#dddddd',
    },
  };
});

afterEach(() => {
  if (view) act(() => view?.unmount());
  view = undefined;
  jest.restoreAllMocks();
});

it('renders both standalone routes and uses browser history when available', () => {
  mockRouter.canGoBack.mockReturnValue(true);
  act(() => {
    view = create(<TermsOfServiceScreen />);
  });

  expect(rendered().root.findByProps({ children: 'Terms of Service' })).toBeTruthy();
  expect(findHost('LegalDocumentContent').props.type).toBe('terms');
  act(() => view?.root.findByProps({ accessibilityLabel: 'Go back' }).props.onPress());
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockRouter.replace).not.toHaveBeenCalled();

  mockRouter.canGoBack.mockReturnValue(false);
  act(() => view?.update(<PrivacyPolicyScreen />));
  expect(rendered().root.findByProps({ children: 'Privacy Policy' })).toBeTruthy();
  expect(findHost('LegalDocumentContent').props.type).toBe('privacy');
  act(() => view?.root.findByProps({ accessibilityLabel: 'Go back' }).props.onPress());
  expect(mockRouter.replace).toHaveBeenCalledWith('/');
});

it('renders the drawer title, forwards visibility, and closes accessibly', () => {
  const onClose = jest.fn();
  const remove = jest.fn();
  jest.mocked(Dimensions.addEventListener).mockReturnValue({ remove } as never);

  act(() => {
    view = create(<PrivacyTermsModal visible type="privacy" onClose={onClose} />);
  });

  expect(rendered().root.findByProps({ children: 'Privacy Policy' })).toBeTruthy();
  expect(findHost('LegalDocumentContent').props).toMatchObject({
    type: 'privacy',
    active: true,
  });
  act(() => view?.root.findByProps({ accessibilityLabel: 'Close' }).props.onPress());
  expect(onClose).toHaveBeenCalledTimes(1);
  act(() => findHost('Modal').props.onRequestClose());
  expect(onClose).toHaveBeenCalledTimes(2);

  const resize = jest.mocked(Dimensions.addEventListener).mock.calls.at(-1)?.[1];
  expect(resize).toBeDefined();
  act(() => resize?.({ window: { width: 500 } } as never));
  const modalContent = rendered().root.findByProps({ accessibilityViewIsModal: true });
  expect(modalContent.props.style.maxWidth).toBe(600);

  mockTheme = { ...mockTheme, isDark: true };
  act(() => view?.update(<PrivacyTermsModal visible={false} type="terms" onClose={onClose} />));
  expect(rendered().root.findByProps({ children: 'Terms of Service' })).toBeTruthy();
  expect(findHost('LegalDocumentContent').props).toMatchObject({
    type: 'terms',
    active: false,
  });
  expect(findHost('ModalBackdrop').props.mode).toBe('dark');

  act(() => view?.unmount());
  view = undefined;
  expect(remove).toHaveBeenCalledTimes(1);
});
