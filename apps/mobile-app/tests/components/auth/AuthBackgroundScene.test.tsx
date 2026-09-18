import React from 'react';
import { act, create } from 'react-test-renderer';
import { AuthBackgroundScene } from '../../../components/auth/AuthBackgroundScene';

const mockSetSize = jest.fn();
const mockDispose = jest.fn();
const mockRender = jest.fn();
jest.mock('three', () => {
  class Vector3 {
    constructor(public x = 0, public y = 0, public z = 0) {}
    set = jest.fn();
    copy = jest.fn();
  }
  return {
    Vector3,
    Scene: class { add = jest.fn(); remove = jest.fn(); },
    Camera: class { position = { z: 0 }; },
    PlaneGeometry: class { dispose = jest.fn(); },
    ShaderMaterial: class { dispose = jest.fn(); },
    Mesh: class {},
    Clock: class { getElapsedTime = () => 1; },
    WebGLRenderer: class {
      domElement = { style: {} };
      setClearColor = jest.fn();
      setPixelRatio = jest.fn();
      setSize = mockSetSize;
      render = mockRender;
      dispose = mockDispose;
    },
  };
});

it('inherits rounded corners, resizes to its panel, and cleans up the observer and renderer', async () => {
  const originals = Object.fromEntries(['window', 'navigator', 'ResizeObserver'].map((key) => [key, Object.getOwnPropertyDescriptor(global, key)]));
  let resize!: () => void;
  const observe = jest.fn();
  const disconnect = jest.fn();
  const removeEventListener = jest.fn();
  const cancelAnimationFrame = jest.fn();
  Object.defineProperty(global, 'window', { configurable: true, value: {
    innerWidth: 1200, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: jest.fn(), removeEventListener,
    requestAnimationFrame: jest.fn(() => 1), cancelAnimationFrame,
  } });
  Object.defineProperty(global, 'navigator', { configurable: true, value: { userAgent: 'Desktop', maxTouchPoints: 0 } });
  global.ResizeObserver = jest.fn().mockImplementation((callback) => {
    resize = callback;
    return { observe, disconnect };
  });
  const panel = { clientWidth: 600, clientHeight: 800, appendChild: jest.fn(), contains: () => true, removeChild: jest.fn() };
  let renderer: ReturnType<typeof create> | undefined;
  try {
    await act(async () => { renderer = create(<AuthBackgroundScene />, { createNodeMock: () => panel }); });
    expect(panel.appendChild).toHaveBeenCalledTimes(1);
    expect(panel.appendChild.mock.calls[0][0].style.borderRadius).toBe('inherit');
    expect(observe).toHaveBeenCalledWith(panel);
    expect(mockSetSize).toHaveBeenLastCalledWith(600, 800, false);
    panel.clientWidth = 480;
    act(() => resize());
    expect(mockSetSize).toHaveBeenLastCalledWith(480, 800, false);
    expect(mockRender).toHaveBeenCalled();
    act(() => renderer!.unmount());
    renderer = undefined;
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(removeEventListener).toHaveBeenCalledWith('resize', resize);
    expect(panel.removeChild).toHaveBeenCalledTimes(1);
    expect(mockDispose).toHaveBeenCalledTimes(1);
  } finally {
    act(() => renderer?.unmount());
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(global, key, descriptor);
      else Reflect.deleteProperty(global, key);
    }
  }
});
