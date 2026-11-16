import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import ContactsPage from '../../app/contacts';
import DashboardContacts from '../../app/(shared)/dashboard/contacts';
const card = '00000000-0000-4000-8000-000000000001';
let mockUser: { id: string } | null = null;
let mockLoading = false;
jest.mock('expo-router', () => ({ Redirect: 'Redirect', useLocalSearchParams: () => ({ card }) }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: mockUser, isLoading: mockLoading }) }));
beforeEach(() => { mockUser = null; mockLoading = false; });
it.each([ContactsPage, DashboardContacts])('preserves the scanned card through sign-in', Component => {
  let view!: ReactTestRenderer;
  act(() => { view = create(<Component />); });
  expect(view.root.findByType('Redirect' as never).props.href).toEqual({ pathname: '/(shared)/auth', params: { returnTo: `/contacts?card=${card}` } });
  act(() => view.unmount());
});
it.each([ContactsPage, DashboardContacts])('routes authenticated users into the protected Contacts tab', Component => {
  mockUser = { id: 'alice' }; let view!: ReactTestRenderer;
  act(() => { view = create(<Component />); });
  expect(view.root.findByType('Redirect' as never).props.href).toEqual({ pathname: '/(shared)/dashboard/wallet', params: { card, section: 'contacts' } });
  act(() => view.unmount());
});
it('waits for authentication bootstrap before redirecting', () => {
  mockLoading = true; let view!: ReactTestRenderer;
  act(() => { view = create(<ContactsPage />); });
  expect(view.root.findAllByType('Redirect' as never)).toHaveLength(0);
  act(() => view.unmount());
});
