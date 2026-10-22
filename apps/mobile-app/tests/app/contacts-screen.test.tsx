import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Image, Modal, Text, TextInput } from 'react-native';
import ContactsExperience from '../../components/contacts/ContactsExperience';
import type { ContactsExperienceProps, ContactsSnapshot } from '../../types/contacts';
const mockCopy = jest.fn();

const mockShowError = jest.fn();
const mockShowSuccess = jest.fn();
jest.mock('../../contexts/ToastContext', () => ({ useToastHelpers: () => ({ showError: (...args: unknown[]) => mockShowError(...args), showSuccess: (...args: unknown[]) => mockShowSuccess(...args) }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../lib/hashpass-logo', () => ({ getHashpassFullLogo: () => ({ uri: 'logo' }) }));
jest.mock('../../lib/api-client', () => ({ apiClient: { get: jest.fn(async () => ({ success: false, error: 'not available' })) } }));
jest.mock('../../components/contacts/ContactsGraph', () => 'ContactsGraph');
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockCopy(...args) }));

const snapshot: ContactsSnapshot = {
  profile: { id: 'me', name: 'Ari', role: '', company: '', topics: ['AI'], points: 20, connections: 0, discoverable: false, leaderboard: false, share_id: '00000000-0000-4000-8000-000000000001', avatar_url: 'https://images.example/ari.png' },
  contacts: [], incoming: [{ id: 'request', profile: { id: 'other', name: 'Robin', role: '', company: '', topics: ['AI'], points: 20, connections: 0, discoverable: true, leaderboard: false } }],
  outgoing: [], suggestions: [], leaderboard: [], shared: null,
};

const props: ContactsExperienceProps = { snapshot, mode: 'dark', signedIn: true, onAction: jest.fn(async () => true), onRetry: jest.fn(), onSignIn: jest.fn(), onDashboard: jest.fn(), onStandalone: jest.fn() };
const control = (view: ReactTestRenderer, label: string) => view.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(-1)!;
const editModal = (view: ReactTestRenderer) => view.root.findAllByType(Modal)[0];

describe('Contacts experience', () => {
  beforeEach(() => jest.clearAllMocks());
  it('opens a real profile editor and only closes it after a successful save', async () => {
    const action = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<ContactsExperience {...props} onAction={action} />); });
    act(() => control(view, 'Edit interests').props.onPress());
    expect(editModal(view).props.visible).toBe(true);
    const name = view.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === 'Name')!;
    act(() => name.props.onChangeText('New name'));
    await act(async () => { await control(view, 'Save contact card').props.onPress(); });
    expect(editModal(view).props.visible).toBe(true);
    expect(action).toHaveBeenLastCalledWith({ action: 'profile', profile: expect.objectContaining({ name: 'New name', topics: ['AI'], leaderboard: false }) });
    await act(async () => { await control(view, 'Save contact card').props.onPress(); });
    expect(editModal(view).props.visible).toBe(false);
    act(() => view.unmount());
  });
  it('lets the recipient accept an incoming request with the real request ID', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<ContactsExperience {...props} />); });
    act(() => {
      const tab = view.root.findAll(node => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function' && node.findAllByType(Text).some(text => text.props.children === 'Incoming')).at(-1)!;
      tab.props.onPress();
    });
    await act(async () => { control(view, 'Accept').props.onPress(); });
    expect(props.onAction).toHaveBeenCalledWith({ action: 'accept', requestId: 'request' });
    act(() => view.unmount());
  });
  it('sends guests to sign-in instead of creating an anonymous contact card', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<ContactsExperience {...props} snapshot={null} signedIn={false} />); });
    act(() => control(view, 'Share card').props.onPress());
    expect(props.onSignIn).toHaveBeenCalled(); expect(props.onAction).not.toHaveBeenCalled();
    act(() => view.unmount());
  });

  it('does not allow a failed initial load to overwrite an existing profile with blank defaults', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<ContactsExperience {...props} snapshot={null} error="unavailable" />); });
    expect(control(view, 'Edit interests').props.accessibilityState.disabled).toBe(true);
    expect(control(view, 'Choose your topics').props.accessibilityState.disabled).toBe(true);
    expect(editModal(view).props.visible).toBe(false);
    act(() => view.unmount());
  });

  it('reports a rejected clipboard write instead of claiming the card was copied', async () => {
    mockCopy.mockResolvedValue(false);
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<ContactsExperience {...props} />); });
    act(() => control(view, 'Share card').props.onPress());
    await act(async () => { await control(view, 'Copy card link').props.onPress(); });
    expect(mockShowError).toHaveBeenCalledWith('Could not copy. Select the card link to copy it manually.');
    expect(control(view, 'Link copied')).toBeUndefined();
    act(() => view.unmount());
  });

  it('renders the owner avatar and branded hpass.id QR destination in the share sheet', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<ContactsExperience {...props} />); });
    act(() => control(view, 'Share card').props.onPress());
    expect(view.root.findAllByType(Image).some(image => image.props.source?.uri === 'https://images.example/ari.png')).toBe(true);
    expect(view.root.findAllByType(Text).some(text => String(text.props.children).includes('https://hpass.id/c/00000000-0000-4000-8000-000000000001'))).toBe(true);
    act(() => view.unmount());
  });
});
