import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable } from 'react-native';

let mockUserId: string | null = 'user-a';
const mockQuery = jest.fn();
const mockEq = jest.fn();
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ dbUserId: mockUserId }) }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ colors: {
  primary: '#a00', divider: '#ddd', background: { paper: '#fff' }, text: { primary: '#111', secondary: '#555' },
} }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../lib/supabase', () => ({ supabase: { from: () => ({ select: () => {
  const query = { eq: (...args: unknown[]) => { mockEq(...args); return query; }, maybeSingle: mockQuery };
  return query;
} }) } }));
import Rewards from '../../components/BlockchainTokensView';

let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
afterEach(() => { if (view) act(() => view.unmount()); });
beforeAll(() => { window.addEventListener = jest.fn(); window.removeEventListener = jest.fn(); });
beforeEach(() => { mockUserId = 'user-a'; mockQuery.mockReset(); mockEq.mockClear(); });

it('keeps provider errors unavailable and allows retry to an authoritative zero', async () => {
  mockQuery.mockResolvedValueOnce({ data: null, error: { message: 'offline' } })
    .mockResolvedValueOnce({ data: null, error: null });
  await act(async () => { view = create(<Rewards />); });
  expect(content()).toContain('Unavailable');
  expect(mockEq).toHaveBeenCalledWith('user_id', 'user-a');
  await act(async () => { view.root.findByType(Pressable).props.onPress(); });
  expect(content()).not.toContain('Unavailable');
  expect(content()).toContain('"0"');
});

it('does not show old-user balances when an earlier request finishes late', async () => {
  let resolveOld!: (value: unknown) => void;
  mockQuery.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce({ data: { balance: '12.500' }, error: null });
  await act(async () => { view = create(<Rewards />); });
  mockUserId = 'user-b';
  await act(async () => { view.update(<Rewards />); });
  await act(async () => { resolveOld({ data: { balance: '999' }, error: null }); });
  expect(content()).toContain('12.500');
  expect(content()).not.toContain('999');
  mockUserId = null;
  await act(async () => { view.update(<Rewards />); });
  expect(content()).not.toContain('12.500');
  expect(content()).toContain('Sign in');
  expect(mockQuery).toHaveBeenCalledTimes(2);
});

it.each(['NaN', '-1', '', 'Infinity'])('rejects invalid provider amount %s', async amount => {
  mockQuery.mockResolvedValue({ data: { balance: amount }, error: null });
  await act(async () => { view = create(<Rewards />); });
  expect(content()).toContain('Unavailable');
});

it('handles rejected requests without substituting zero', async () => {
  mockQuery.mockRejectedValue(new Error('offline'));
  await act(async () => { view = create(<Rewards />); });
  expect(content()).toContain('Unavailable');
});
