/// <reference types="jest" />

import React from 'react';
import { Alert } from 'react-native';

import AdminQRScanner from '../../components/AdminQRScanner';

const mockPost = jest.fn();
const mockCheckValidity = jest.fn();
const mockValidateAndUse = jest.fn();
const mockGetQRByToken = jest.fn();
let capturedOnScan: ((result: { data: string }) => Promise<void> | void) | null = null;
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

jest.mock('expo-camera', () => ({
  CameraView: 'CameraView',
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563eb',
      background: { default: '#f8fafc', paper: '#ffffff', secondary: '#f1f5f9' },
      error: { main: '#b42318' },
      success: { main: '#187548' },
      divider: '#d1d5db',
      text: { primary: '#111827', secondary: '#4b5563', disabled: '#9ca3af' },
    },
  }),
}));
// The scanner's open/reset effect depends on `user`, so it must be referentially stable.
const mockAdminUser = { id: 'admin-1' };
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: mockAdminUser }) }));
jest.mock('../../lib/admin-access', () => ({
  getCurrentAdminAccess: jest.fn(async () => ({ globalRole: 'super_admin', eventRoles: [] })),
}));
jest.mock('../../lib/camera-permissions', () => ({
  cameraPermissionManager: {
    getPermissionStatus: jest.fn(async () => ({ status: 'granted' })),
    requestWithFallback: jest.fn(async () => ({ status: 'granted' })),
  },
}));
jest.mock('../../lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args), get: jest.fn() },
}));
jest.mock('../../lib/qr-system', () => ({
  qrSystemService: {
    checkQRValidity: (...args: unknown[]) => mockCheckValidity(...args),
    validateAndUseQR: (...args: unknown[]) => mockValidateAndUse(...args),
    getQRByToken: (...args: unknown[]) => mockGetQRByToken(...args),
  },
}));
jest.mock('../../lib/qr-payload-resolver', () => ({ resolveHashpassQrPayload: jest.fn() }));
jest.mock('../../lib/barcode-scanner-compat', () => ({
  BarCodeScanner: Object.assign(() => null, { Constants: { BarCodeType: { qr: 'qr' } } }),
}));
jest.mock('../../lib/qr-scanner-service', () => {
  const actual = jest.requireActual('../../lib/qr-scanner-service');
  return {
    ...actual,
    qrScannerService: Object.assign(Object.create(actual.qrScannerService), {
      createScanHandler: (handlers: { onScan: typeof capturedOnScan }) => {
        capturedOnScan = handlers.onScan;
        return () => undefined;
      },
      enableWebFallback: jest.fn(),
    }),
  };
});
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons', Ionicons: 'Ionicons' }));
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: 'MaterialIcons', Ionicons: 'Ionicons' }));

const { act, create } = require('react-test-renderer');

const claim = {
  valid: true,
  status: 'pending',
  message: 'Original ticket claim found and ready for review',
  claim: {
    id: 'claim-1',
    event_id: 'chile2026',
    issuer: 'blockchain_summit_latam',
    ticket_code_last4: '9XQ2',
    requested_pass_type: 'business',
    status: 'pending',
    hashpass_pass_id: null,
  },
};

describe('AdminQRScanner original ticket inspection', () => {
  let renderer: ReturnType<typeof create> | null = null;

  const mount = async () => {
    await act(async () => {
      renderer = create(<AdminQRScanner visible onClose={jest.fn()} />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const scan = async (data: string) => {
    await act(async () => {
      await capturedOnScan?.({ data });
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    capturedOnScan = null;
    mockPost.mockResolvedValue({ success: true, data: { data: claim } });
    mockCheckValidity.mockResolvedValue({ valid: false, status: 'invalid', message: 'QR code not found' });
    mockGetQRByToken.mockResolvedValue(null);
  });
  afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = null;
  });

  it('inspects an external ticket whose JSON carries a token field and offers shared-button approval', async () => {
    await mount();
    expect(capturedOnScan).toBeTruthy();
    await scan(JSON.stringify({ issuer: 'bsl', token: 'EXTERNAL-TICKET-TOKEN-123' }));

    expect(mockCheckValidity).toHaveBeenCalledWith('EXTERNAL-TICKET-TOKEN-123');
    expect(mockPost).toHaveBeenCalledWith(
      '/admin/pass-ticket-claims',
      { action: 'inspect', qrPayload: expect.stringContaining('EXTERNAL-TICKET-TOKEN-123') },
      { skipEventSegment: true },
    );
    expect(mockValidateAndUse).not.toHaveBeenCalled();
    const approve = renderer!.root.findAllByProps({ accessibilityLabel: 'Approve & create pass' });
    expect(approve.length).toBeGreaterThan(0);
    expect(approve[0].props.accessibilityRole).toBe('button');
  });

  it('inspects an external ticket URL with a token query parameter', async () => {
    await mount();
    await scan('https://tickets.example.com/entry?token=ABCDEFGHIJKLMNOPQRSTUV');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByProps({ children: 'Original ticket claim found and ready for review' }).length)
      .toBeGreaterThan(0);
  });

  it('keeps the native failure when the unrecognised token is not a submitted ticket either', async () => {
    mockPost.mockResolvedValue({ success: true, data: { data: { valid: false, status: 'unregistered', message: 'not submitted' } } });
    await mount();
    await scan('QR-ABCDEFGH12');
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Approve & create pass' })).toHaveLength(0);
    expect(renderer!.root.findAllByProps({ children: 'QR code not found' }).length).toBeGreaterThan(0);
  });

  it('keeps the native failure when inspection is unavailable', async () => {
    mockPost.mockRejectedValue(new Error('network'));
    await mount();
    await scan('QR-ABCDEFGH12');
    expect(renderer!.root.findAllByProps({ children: 'QR code not found' }).length).toBeGreaterThan(0);
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('does not inspect externally when the native token is recognised', async () => {
    mockCheckValidity.mockResolvedValue({ valid: true, status: 'valid', message: 'QR code is valid' });
    mockValidateAndUse.mockResolvedValue({ valid: true, status: 'valid', message: 'QR code is valid' });
    await mount();
    await scan('QR-ABCDEFGH12');
    expect(mockPost).not.toHaveBeenCalled();
    expect(mockValidateAndUse).toHaveBeenCalledWith('QR-ABCDEFGH12', 'admin-1', 'admin-scanner');
  });
});
