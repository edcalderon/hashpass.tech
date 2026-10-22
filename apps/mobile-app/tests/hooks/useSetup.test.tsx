import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useSetup } from '../../hooks/useSetup';
import { CURRENT_CONSENT_VERSION } from '../../lib/setup';
import type { UserSetup } from '../../types/setup';

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock('../../lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) },
}));

const fresh: UserSetup = {
  status: 'not_started', step: 0, goals: [], topics: [], privacyScope: 'private', consentVersion: null, completedAt: null,
  pin: { enabled: false, lockedUntil: null, remainingAttempts: null },
};
const done: UserSetup = {
  ...fresh, status: 'complete', step: 3, goals: ['learn'], topics: ['AI'], consentVersion: CURRENT_CONSENT_VERSION,
  completedAt: '2026-10-01T00:00:00.000Z', pin: { enabled: true, lockedUntil: null, remainingAttempts: 5 },
};
const answer = (data: unknown) => ({ success: true, data: { success: true, data } });

let state: ReturnType<typeof useSetup>;
function Probe({ id }: { id: string | null }) { state = useSetup(id); return null; }

const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
async function mount(id: string | null = 'alice') {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(<Probe id={id} />); });
  await settle();
  return view;
}

describe('useSetup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('never asks the server about a guest', async () => {
    const view = await mount(null);
    expect(mockGet).not.toHaveBeenCalled();
    expect(state.view).toBeNull();
    expect(state.required).toBe(false);
    act(() => view.unmount());
  });

  it('opens the wizard for someone who has not finished, and stays out of the way for someone who has', async () => {
    mockGet.mockResolvedValueOnce(answer(fresh)).mockResolvedValueOnce(answer(done));
    const first = await mount('alice');
    expect(state.view).toMatchObject({ phase: 'wizard', step: 'goals' });
    expect(state.required).toBe(true);
    act(() => first.unmount());

    const second = await mount('bob');
    expect(state.view?.phase).toBe('complete');
    expect(state.required).toBe(false);
    act(() => second.unmount());
  });

  it('saves a draft per step, in order, and a failed draft does not stop the wizard', async () => {
    mockGet.mockResolvedValue(answer(fresh));
    mockPost.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(answer(fresh));
    const view = await mount();

    act(() => state.send({ type: 'TOGGLE_GOAL', goal: 'hire' }));
    act(() => state.send({ type: 'NEXT' }));
    expect(state.view?.step).toBe('topics');
    act(() => state.send({ type: 'TOGGLE_TOPIC', topic: 'AI' }));
    act(() => state.send({ type: 'NEXT' }));
    await settle();

    expect(state.view?.step).toBe('privacy');
    expect(mockPost.mock.calls.map(call => call[1])).toEqual([
      { goals: ['hire'], step: 1 },
      { topics: ['AI'], step: 2 },
    ]);
    act(() => view.unmount());
  });

  it('finishes after the drafts, with everything collected, and then leaves the wizard', async () => {
    mockGet.mockResolvedValue(answer(fresh));
    let releaseDraft!: (value: unknown) => void;
    mockPost
      .mockImplementationOnce(() => new Promise(resolve => { releaseDraft = resolve; }))
      .mockImplementationOnce(() => Promise.resolve(answer(fresh)))
      .mockImplementationOnce(() => Promise.resolve(answer(done)));
    const view = await mount();

    act(() => state.send({ type: 'TOGGLE_GOAL', goal: 'learn' }));
    act(() => state.send({ type: 'NEXT' }));
    act(() => state.send({ type: 'NEXT' }));
    act(() => state.send({ type: 'SET_CONSENT', accepted: true }));
    act(() => state.send({ type: 'PIN_SET' }));
    act(() => state.send({ type: 'FINISH' }));
    await settle();
    // The slow first draft is still in flight, so nothing after it may have been sent yet.
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(state.view?.phase).toBe('finishing');

    await act(async () => { releaseDraft(answer(fresh)); });
    await settle();
    expect(mockPost).toHaveBeenCalledTimes(3);
    expect(mockPost.mock.calls[2]?.[1]).toEqual({
      goals: ['learn'], topics: [], privacyScope: 'private', consentVersion: CURRENT_CONSENT_VERSION, step: 3, complete: true,
    });
    expect(state.view?.phase).toBe('complete');
    expect(state.context).toMatchObject({ goals: ['learn'], pinEnabled: true });
    act(() => view.unmount());
  });

  it('returns to the last step with the answers intact when the final save fails', async () => {
    mockGet.mockResolvedValue(answer(fresh));
    mockPost.mockResolvedValueOnce(answer(fresh)).mockResolvedValueOnce(answer(fresh)).mockRejectedValueOnce(new Error('503'));
    const view = await mount();
    act(() => state.send({ type: 'TOGGLE_GOAL', goal: 'hire' }));
    act(() => state.send({ type: 'NEXT' }));
    act(() => state.send({ type: 'NEXT' }));
    act(() => state.send({ type: 'SET_CONSENT', accepted: true }));
    act(() => state.send({ type: 'PIN_SET' }));
    act(() => state.send({ type: 'FINISH' }));
    await settle();
    expect(state.view).toMatchObject({ phase: 'wizard', step: 'privacy', error: 'save_failed', canFinish: true });
    expect(state.context?.goals).toEqual(['hire']);
    act(() => view.unmount());
  });

  it('offers a retry when loading fails', async () => {
    mockGet.mockResolvedValueOnce({ success: false, error: 'unavailable', status: 503, data: null }).mockResolvedValueOnce(answer(fresh));
    const view = await mount();
    expect(state.view).toMatchObject({ phase: 'loadFailed', error: 'load_failed' });
    act(() => state.send({ type: 'RETRY' }));
    await settle();
    expect(state.view).toMatchObject({ phase: 'wizard', step: 'goals', error: null });
    act(() => view.unmount());
  });

  it('shows the next account nothing from the previous one, even if the old answer lands late', async () => {
    let releaseOld!: (value: unknown) => void;
    mockGet.mockImplementationOnce(() => new Promise(resolve => { releaseOld = resolve; })).mockResolvedValueOnce(answer(fresh));
    const view = await mount('alice');
    expect(state.view?.phase).toBe('loading');
    await act(async () => { view.update(<Probe id="bob" />); });
    await settle();
    await act(async () => { releaseOld(answer({ ...done, goals: ['investors'] })); });
    await settle();
    expect(state.view).toMatchObject({ phase: 'wizard', step: 'goals' });
    expect(state.context?.goals).toEqual([]);
    act(() => view.unmount());
  });

  it('stops the machine when the screen goes away', async () => {
    mockGet.mockResolvedValue(answer(fresh));
    const view = await mount();
    act(() => view.unmount());
    expect(() => state.send({ type: 'NEXT' })).not.toThrow();
  });
});
