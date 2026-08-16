/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

const mockWebglRendererCtor = jest.fn();

jest.mock('three', () => {
  class FakeVector2 {
    x = 0;
    y = 0;
    set = jest.fn();
  }
  class FakeCamera {
    position = { z: 0 };
  }
  class FakeScene {
    add = jest.fn();
    remove = jest.fn();
  }
  class FakePlaneGeometry {
    dispose = jest.fn();
  }
  class FakeShaderMaterial {
    dispose = jest.fn();
  }
  class FakeMesh {}
  class FakeWebGLRenderer {
    domElement = { style: {} };
    setPixelRatio = jest.fn();
    setClearColor = jest.fn();
    setSize = jest.fn();
    render = jest.fn();
    dispose = jest.fn();
    constructor(...args: unknown[]) {
      mockWebglRendererCtor(...args);
    }
  }
  return {
    Camera: FakeCamera,
    Scene: FakeScene,
    PlaneGeometry: FakePlaneGeometry,
    ShaderMaterial: FakeShaderMaterial,
    Mesh: FakeMesh,
    WebGLRenderer: FakeWebGLRenderer,
    Vector2: FakeVector2,
  };
});

import AuthShaderScene from '../../../components/auth/AuthShaderScene.web';

describe('AuthShaderScene (web)', () => {
  const originalWindow = global.window;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockWebglRendererCtor.mockClear();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    Object.defineProperty(global, 'window', { configurable: true, value: originalWindow });
  });

  it('does not crash the app when WebGL context creation throws', async () => {
    mockWebglRendererCtor.mockImplementation(() => {
      throw new Error('Failed to create WebGL context');
    });

    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { devicePixelRatio: 1, addEventListener: jest.fn(), removeEventListener: jest.fn() },
    });

    const container = { appendChild: jest.fn(), contains: jest.fn(), removeChild: jest.fn() };

    let renderer!: TestRenderer.ReactTestRenderer;
    await expect(
      act(async () => {
        renderer = TestRenderer.create(<AuthShaderScene />, {
          createNodeMock: () => container,
        });
      }),
    ).resolves.not.toThrow();

    expect(mockWebglRendererCtor).toHaveBeenCalledTimes(1);
    expect(container.appendChild).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'AuthShaderScene: WebGL unavailable, skipping animated background',
      expect.any(Error),
    );

    await act(async () => {
      renderer.unmount();
    });
  });

  it('mounts the renderer onto the container when WebGL is available', async () => {
    mockWebglRendererCtor.mockImplementation(() => {});

    Object.defineProperty(global, 'window', {
      configurable: true,
      value: {
        devicePixelRatio: 1,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        innerWidth: 800,
        innerHeight: 600,
        requestAnimationFrame: jest.fn(() => 1),
        cancelAnimationFrame: jest.fn(),
      },
    });

    const container = {
      clientWidth: 800,
      clientHeight: 600,
      appendChild: jest.fn(),
      contains: jest.fn(() => true),
      removeChild: jest.fn(),
    };

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<AuthShaderScene />, {
        createNodeMock: () => container,
      });
    });

    expect(mockWebglRendererCtor).toHaveBeenCalledTimes(1);
    expect(container.appendChild).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });

    expect(container.removeChild).toHaveBeenCalledTimes(1);
  });
});
