/// <reference types="jest" />

import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (...args: unknown[]) => mockGetItem(...args),
    setItem: (...args: unknown[]) => mockSetItem(...args),
  },
}));

import { AnimationLevelProvider, useAnimationLevel } from '../../contexts/AnimationLevelContext';

let latestContext: ReturnType<typeof useAnimationLevel> | null = null;

function CaptureContext() {
  latestContext = useAnimationLevel();

  useEffect(() => {
    return () => {
      latestContext = null;
    };
  }, []);

  return null;
}

const flushPromises = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('AnimationLevelContext', () => {
beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
    mockSetItem.mockResolvedValue(undefined);
    latestContext = null;
  });

  it('keeps the default level when storage has no saved value', async () => {
    mockGetItem.mockResolvedValueOnce(null);

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <AnimationLevelProvider>
          <CaptureContext />
        </AnimationLevelProvider>
      );
      await flushPromises();
    });

    expect(latestContext?.animationLevel).toBe('full');
    expect(typeof latestContext?.setAnimationLevel).toBe('function');
    expect(mockGetItem).toHaveBeenCalledWith('@animation_level');

    await act(async () => {
      renderer!.unmount();
    });
  });

  it('hydrates and persists the stored animation level', async () => {
    mockGetItem.mockResolvedValueOnce('reduced');

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <AnimationLevelProvider>
          <CaptureContext />
        </AnimationLevelProvider>
      );
      await flushPromises();
    });

    expect(latestContext?.animationLevel).toBe('reduced');

    await act(async () => {
      latestContext?.setAnimationLevel('none');
      await flushPromises();
    });

    expect(latestContext?.animationLevel).toBe('none');
    expect(mockSetItem).toHaveBeenCalledWith('@animation_level', 'none');

    await act(async () => {
      renderer!.unmount();
    });
  });
});
