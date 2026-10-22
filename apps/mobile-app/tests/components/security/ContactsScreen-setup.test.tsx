import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import ContactsScreen from '../../../components/contacts/ContactsScreen';

let mockUser: { id: string } | null = { id: 'alice' };
let mockAuthLoading = false;
let mockSetup: any;
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, isLoading: mockAuthLoading }) }));
jest.mock('../../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('../../../hooks/useContacts', () => ({ useContacts: () => ({ snapshot: null, loading: false, busy: false, error: null, act: jest.fn(), reload: jest.fn() }) }));
const mockUseSetup = jest.fn((_id: string | null) => mockSetup);
const mockUsePin = jest.fn((_id: string | null) => ({ pin: true }));
jest.mock('../../../hooks/useSetup', () => ({ useSetup: (id: string | null) => mockUseSetup(id) }));
jest.mock('../../../hooks/usePin', () => ({ usePin: (id: string | null) => mockUsePin(id) }));
jest.mock('../../../components/security/SetupWizard', () => ({ __esModule: true, default: 'SetupWizard' }));
jest.mock('../../../components/contacts/ContactsExperience', () => ({ __esModule: true, default: 'ContactsExperience' }));

const wizard = { view: { phase: 'wizard', step: 'goals' }, context: { goals: [] }, send: jest.fn() };
const kinds = (view: ReactTestRenderer) => ['SetupWizard', 'ContactsExperience'].filter(type => view.root.findAllByType(type as never).length > 0);
async function mount() { let view!: ReactTestRenderer; await act(async () => { view = create(<ContactsScreen standalone />); }); return view; }

describe('Contacts setup gate', () => {
  beforeEach(() => { jest.clearAllMocks(); mockUser = { id: 'alice' }; mockAuthLoading = false; });

  it('shows the setup wizard, and no contacts, until setup is complete', async () => {
    mockSetup = wizard;
    const view = await mount();
    expect(kinds(view)).toEqual(['SetupWizard']);
    expect(view.root.findByType('SetupWizard' as never).props).toMatchObject({ mode: 'light', pin: { pin: true }, send: wizard.send });
    act(() => view.unmount());
  });

  it('keeps the wizard up while the final save runs, then shows contacts once complete', async () => {
    mockSetup = { ...wizard, view: { phase: 'finishing', step: 'privacy' } };
    const view = await mount();
    expect(kinds(view)).toEqual(['SetupWizard']);
    mockSetup = { ...wizard, view: { phase: 'complete', step: null } };
    await act(async () => { view.update(<ContactsScreen standalone />); });
    expect(kinds(view)).toEqual(['ContactsExperience']);
    act(() => view.unmount());
  });

  it('never gates guests, and asks the server nothing while auth is still loading', async () => {
    mockUser = null;
    mockSetup = { view: null, context: null, send: jest.fn() };
    const guest = await mount();
    expect(kinds(guest)).toEqual(['ContactsExperience']);
    expect(mockUseSetup).toHaveBeenCalledWith(null);
    act(() => guest.unmount());

    mockUser = { id: 'alice' }; mockAuthLoading = true; jest.clearAllMocks();
    const loading = await mount();
    expect(mockUseSetup).toHaveBeenCalledWith(null);
    expect(mockUsePin).toHaveBeenCalledWith(null);
    act(() => loading.unmount());
  });

  it('keys setup and PIN to the signed-in account', async () => {
    mockSetup = { view: { phase: 'complete', step: null }, context: {}, send: jest.fn() };
    const view = await mount();
    expect(mockUseSetup).toHaveBeenCalledWith('alice');
    expect(mockUsePin).toHaveBeenCalledWith('alice');
    act(() => view.unmount());
  });
});
