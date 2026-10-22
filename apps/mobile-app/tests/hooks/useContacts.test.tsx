import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useContacts } from '../../hooks/useContacts';
import type { ContactsSnapshot } from '../../types/contacts';
const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../../lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) } }));
const empty: ContactsSnapshot = { profile: null, contacts: [], incoming: [], outgoing: [], suggestions: [], leaderboard: [], shared: null };
let state: ReturnType<typeof useContacts>;
function Probe({ id }: { id: string | null }) { state = useContacts(id); return null; }

describe('Contacts session isolation', () => {
  beforeEach(() => jest.clearAllMocks());
  it('never fetches private data for guests', async () => {
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Probe id={null} />); });
    expect(mockGet).not.toHaveBeenCalled(); expect(state.snapshot).toBeNull();
    act(() => view.unmount());
  });
  it('discards delayed results from the previous account', async () => {
    let resolveOld!: (value: unknown) => void;
    mockGet.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce({ success: true, data: empty });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Probe id="old" />); });
    await act(async () => { view.update(<Probe id="new" />); });
    await act(async () => { resolveOld({ success: true, data: { ...empty, outgoing: ['old-secret'] } }); });
    expect(state.snapshot).toEqual(empty);
    act(() => view.unmount());
  });
  it('releases the busy state after transport failure and can retry', async () => {
    mockGet.mockResolvedValue({ success: true, data: empty }); mockPost.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ success: true, data: empty });
    let view!: ReactTestRenderer;
    await act(async () => { view = create(<Probe id="user" />); });
    await act(async () => { expect(await state.act({ action: 'accept', requestId: 'request' })).toBe(false); });
    expect(state.busy).toBe(false); expect(state.error).toBeTruthy();
    await act(async () => { expect(await state.act({ action: 'accept', requestId: 'request' })).toBe(true); });
    expect(state.error).toBeNull();
    act(() => view.unmount());
  });
});
