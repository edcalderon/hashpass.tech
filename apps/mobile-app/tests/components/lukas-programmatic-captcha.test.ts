/// <reference types="jest" />

const captchaModule = require('../../../../packages/infra/terraform/stacks/hashpass-lukas-site/overrides/components/LukasCaptcha') as {
  solveLukasCaptcha?: () => Promise<string>;
};

type FakeCapScript = {
  dataset: Record<string, string>;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  remove: jest.Mock;
};

const restoreGlobal = (name: string, value: unknown) => {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, name);
    return;
  }
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
};

const installCapRuntime = (solve: jest.Mock) => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalCustomElements = (globalThis as { customElements?: unknown }).customElements;
  const widget = { remove: jest.fn() };
  const Cap = jest.fn().mockImplementation(() => ({ solve, widget }));
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: { customElements: {}, Cap },
  });
  Object.defineProperty(globalThis, 'customElements', {
    configurable: true,
    writable: true,
    value: { get: () => ({}), whenDefined: jest.fn().mockResolvedValue(undefined) },
  });
  return {
    Cap,
    widget,
    restore: () => {
      restoreGlobal('window', originalWindow);
      restoreGlobal('customElements', originalCustomElements);
    },
  };
};

describe('LUKAS programmatic Cap.js proof', () => {
  it('uses the configured Cap.js endpoint and returns a successful server token', async () => {
    const solve = jest.fn().mockResolvedValue({ success: true, token: 'programmatic-proof' });
    const runtime = installCapRuntime(solve);
    const solver = captchaModule.solveLukasCaptcha;
    expect(typeof solver).toBe('function');

    if (!solver) return;
    try {
      await expect(solver()).resolves.toBe('programmatic-proof');
      expect(runtime.Cap).toHaveBeenCalledWith({ apiEndpoint: 'https://api.hashpass.tech/api/captcha/' });
      expect(solve).toHaveBeenCalledTimes(1);
      expect(runtime.widget.remove).toHaveBeenCalledTimes(1);
    } finally {
      runtime.restore();
    }
  });

  it('fails closed when Cap.js returns an unsuccessful proof', async () => {
    const solve = jest.fn().mockResolvedValue({ success: false, token: '' });
    const runtime = installCapRuntime(solve);
    const solver = captchaModule.solveLukasCaptcha;
    expect(typeof solver).toBe('function');

    if (!solver) return;
    try {
      await expect(solver()).rejects.toThrow('The security check could not be completed. Please try again.');
      expect(runtime.widget.remove).toHaveBeenCalledTimes(1);
    } finally {
      runtime.restore();
    }
  });

  it('fails closed when Cap.js cannot produce a proof token', async () => {
    const solve = jest.fn().mockRejectedValue(new Error('provider detail must not reach the user'));
    const runtime = installCapRuntime(solve);
    const solver = captchaModule.solveLukasCaptcha;
    expect(typeof solver).toBe('function');

    if (!solver) return;
    try {
      await expect(solver()).rejects.toThrow('The security check could not be completed. Please try again.');
      expect(runtime.widget.remove).toHaveBeenCalledTimes(1);
    } finally {
      runtime.restore();
    }
  });

  it('removes a failed script so a later submission can retry', async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const originalCustomElements = (globalThis as { customElements?: unknown }).customElements;
    const originalDocument = (globalThis as { document?: unknown }).document;
    let activeScript: FakeCapScript | null = null;
    const createdScripts: FakeCapScript[] = [];
    const customElementsRuntime = {
      get: jest.fn(() => undefined),
      whenDefined: jest.fn().mockResolvedValue(undefined),
    };
    const solve = jest.fn().mockResolvedValue({ success: true, token: 'retry-proof' });
    const widget = { remove: jest.fn() };
    const Cap = jest.fn().mockImplementation(() => ({ solve, widget }));
    const documentRuntime = {
      createElement: jest.fn(() => {
        const script: FakeCapScript = {
          dataset: {},
          onload: null,
          onerror: null,
          remove: jest.fn(() => {
            if (activeScript === script) activeScript = null;
          }),
        };
        createdScripts.push(script);
        return script;
      }),
      querySelector: jest.fn(() => activeScript),
      head: {
        appendChild: jest.fn((script: FakeCapScript) => {
          activeScript = script;
        }),
      },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { customElements: customElementsRuntime, Cap },
    });
    Object.defineProperty(globalThis, 'customElements', {
      configurable: true,
      writable: true,
      value: customElementsRuntime,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: documentRuntime,
    });

    try {
      const firstAttempt = captchaModule.solveLukasCaptcha?.();
      const failedScript = createdScripts[0];
      expect(failedScript).toBeDefined();
      failedScript.onerror?.();
      await expect(firstAttempt).rejects.toThrow('The security check could not be completed. Please try again.');
      expect(activeScript).toBeNull();

      const retryAttempt = captchaModule.solveLukasCaptcha?.();
      const retryScript = createdScripts[1];
      expect(retryScript).toBeDefined();
      expect(retryScript).not.toBe(failedScript);
      retryScript.onload?.();
      await expect(retryAttempt).resolves.toBe('retry-proof');
      expect(widget.remove).toHaveBeenCalledTimes(1);
    } finally {
      restoreGlobal('window', originalWindow);
      restoreGlobal('customElements', originalCustomElements);
      restoreGlobal('document', originalDocument);
    }
  });

  it('rejects every concurrent caller when a shared script load fails', async () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    const originalCustomElements = (globalThis as { customElements?: unknown }).customElements;
    const originalDocument = (globalThis as { document?: unknown }).document;
    let activeScript: FakeCapScript | null = null;
    const createdScripts: FakeCapScript[] = [];
    const customElementsRuntime = {
      get: jest.fn(() => undefined),
      whenDefined: jest.fn(() => new Promise<void>(() => {})),
    };
    const solve = jest.fn().mockResolvedValue({ success: true, token: 'unused-proof' });
    const Cap = jest.fn().mockImplementation(() => ({ solve }));
    const documentRuntime = {
      createElement: jest.fn(() => {
        const script: FakeCapScript = {
          dataset: {},
          onload: null,
          onerror: null,
          remove: jest.fn(() => {
            if (activeScript === script) activeScript = null;
          }),
        };
        createdScripts.push(script);
        return script;
      }),
      querySelector: jest.fn(() => activeScript),
      head: {
        appendChild: jest.fn((script: FakeCapScript) => {
          activeScript = script;
        }),
      },
    };
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { customElements: customElementsRuntime, Cap },
    });
    Object.defineProperty(globalThis, 'customElements', {
      configurable: true,
      writable: true,
      value: customElementsRuntime,
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      writable: true,
      value: documentRuntime,
    });

    try {
      const firstAttempt = captchaModule.solveLukasCaptcha?.();
      const secondAttempt = captchaModule.solveLukasCaptcha?.();
      const secondSettled = jest.fn();
      secondAttempt?.then(secondSettled, secondSettled);
      expect(createdScripts).toHaveLength(1);

      createdScripts[0].onerror?.();
      await expect(firstAttempt).rejects.toThrow('The security check could not be completed. Please try again.');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(secondSettled).toHaveBeenCalledTimes(1);
    } finally {
      restoreGlobal('window', originalWindow);
      restoreGlobal('customElements', originalCustomElements);
      restoreGlobal('document', originalDocument);
    }
  });
});
