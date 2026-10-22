import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ContactsPage from '../../app/contacts';
import DashboardContacts from '../../app/(shared)/dashboard/contacts';

const mockPush = jest.fn();
const mockReload = jest.fn();
const mockContacts = jest.fn();
let mockAuth: { user: { id: string } | null; isLoading: boolean };
const card = '00000000-0000-4000-8000-000000000001';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => ({ card }) }));
jest.mock('expo-router/head', () => ({ __esModule: true, default: 'Head' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => mockAuth }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: true }) }));
jest.mock('../../hooks/useContacts', () => ({ useContacts: (...args: unknown[]) => mockContacts(...args) }));
// The setup wizard and PIN seams pull `lib/setup-client` -> `lib/api-client` ->
// expo-constants, whose module init crashes under this suite's mock set. They are
// not what these routing tests exercise: with a null setup view the screen renders
// ContactsExperience (mocked below), exactly the surface under test.
jest.mock('../../hooks/useSetup', () => ({ useSetup: () => ({ view: null, context: null, required: false, send: jest.fn() }) }));
jest.mock('../../hooks/usePin', () => ({
  usePin: () => ({
    busy: false,
    problem: null,
    isUnlocked: () => false,
    setPin: jest.fn(async () => true),
    unlock: jest.fn(async () => true),
    proofFor: () => null,
    lock: jest.fn(),
    clearProblem: jest.fn(),
  }),
}));
jest.mock('../../components/contacts/ContactsExperience', () => 'ContactsExperience');
// SetupWizard's static import chain (PinPad -> expo-haptics -> expo-asset ->
// expo-constants) crashes this suite's mock environment at module init; the
// wizard itself is not what these routing tests exercise.
jest.mock('../../components/security/SetupWizard', () => 'SetupWizard');

describe('Contacts standalone and dashboard routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { user: null, isLoading: false };
    mockContacts.mockReturnValue({ snapshot: null, loading: false, busy: false, error: null, act: jest.fn(), reload: mockReload });
  });
  it('keeps the scanned card in the return path when a guest signs in', () => {
    let view!: ReactTestRenderer;
    act(() => { view = create(<ContactsPage />); });
    const experience = view.root.findByType('ContactsExperience' as never);
    act(() => experience.props.onSignIn());
    expect(mockContacts).toHaveBeenCalledWith(null, card);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(shared)/auth', params: { returnTo: `/contacts?card=${card}` } });
    expect(experience.props.standalone).toBe(true);
    act(() => view.unmount());
  });
  it('lets an authenticated user move between both experiences and retry loading', () => {
    mockAuth = { user: { id: 'user' }, isLoading: false };
    let view!: ReactTestRenderer;
    act(() => { view = create(<ContactsPage />); });
    const experience = view.root.findByType('ContactsExperience' as never);
    act(() => { experience.props.onDashboard(); experience.props.onStandalone(); experience.props.onRetry(); });
    expect(mockContacts).toHaveBeenCalledWith('user', card);
    expect(mockPush).toHaveBeenCalledWith('/(shared)/dashboard/contacts');
    expect(mockPush).toHaveBeenCalledWith('/contacts');
    expect(mockReload).toHaveBeenCalled();
    act(() => view.unmount());
  });
  it('keeps dashboard content embedded and defers private data reads during auth bootstrap', () => {
    mockAuth = { user: { id: 'user' }, isLoading: true };
    let view!: ReactTestRenderer;
    act(() => { view = create(<DashboardContacts />); });
    const experience = view.root.findByType('ContactsExperience' as never);
    expect(experience.props.standalone).toBe(false);
    expect(experience.props.loading).toBe(true);
    expect(mockContacts).toHaveBeenCalledWith(null, card);
    act(() => view.unmount());
  });
});
