/// <reference types="jest" />

import { useCopilot } from '../../lib/copilot-shim';

describe('copilot shim', () => {
  it('returns the same disabled API object for every consumer render', () => {
    const first = useCopilot();
    const second = useCopilot();

    expect(second).toBe(first);
    expect(second.start).toBe(first.start);
    expect(second.copilotEvents).toBe(first.copilotEvents);
    expect(first.start()).toBe(false);
  });
});
