/// <reference types="jest" />
/* eslint-disable import/first */

let mockPlatformOs = 'android';
const mockConstants = {
  isDevice: true,
  expoConfig: { extra: { eas: { projectId: 'expo-project' } } } as any,
  easConfig: null as { projectId?: string } | null,
};
const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockSetNotificationChannelAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiDelete = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get isDevice() { return mockConstants.isDevice; },
    get expoConfig() { return mockConstants.expoConfig; },
    get easConfig() { return mockConstants.easConfig; },
  },
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  setNotificationChannelAsync: (...args: unknown[]) => mockSetNotificationChannelAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
  AndroidImportance: { DEFAULT: 3 },
}));
jest.mock('react-native', () => ({ Platform: { get OS() { return mockPlatformOs; } } }));
jest.mock('../../lib/api-client', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
    delete: (...args: unknown[]) => mockApiDelete(...args),
  },
}));

import {
  disablePushForCurrentAccount,
  registerCurrentDeviceForPush,
} from '../../lib/push-notification-registration';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalNotification = Object.getOwnPropertyDescriptor(globalThis, 'Notification');

function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

function installBrowser(options: {
  permission?: string;
  requestPermission?: string;
  subscription?: any;
  existingSubscription?: boolean;
  subscribe?: jest.Mock;
  serviceWorker?: boolean;
  pushManager?: boolean;
} = {}) {
  const requestPermission = jest.fn().mockResolvedValue(options.requestPermission || 'granted');
  const browserNotification = { permission: options.permission || 'granted', requestPermission };
  const subscription = options.subscription || {
    endpoint: 'https://fcm.googleapis.com/fcm/send/device',
    toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/device', keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: jest.fn().mockResolvedValue(true),
  };
  const subscribe = options.subscribe || jest.fn().mockResolvedValue(subscription);
  const registration = {
    pushManager: {
      getSubscription: jest.fn().mockResolvedValue(options.existingSubscription === false ? null : subscription),
      subscribe,
    },
  };
  const browserWindow: Record<string, unknown> = { Notification: browserNotification };
  if (options.pushManager !== false) browserWindow.PushManager = function PushManager() {};
  setGlobal('window', browserWindow);
  setGlobal('navigator', options.serviceWorker === false ? {} : { serviceWorker: { ready: Promise.resolve(registration) } });
  return { requestPermission, browserNotification, subscription, subscribe, registration };
}

beforeEach(() => {
  mockPlatformOs = 'android';
  mockConstants.isDevice = true;
  mockConstants.expoConfig = { extra: { eas: { projectId: 'expo-project' } } };
  mockConstants.easConfig = null;
  mockGetPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  mockRequestPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  mockSetNotificationChannelAsync.mockReset().mockResolvedValue(undefined);
  mockGetExpoPushTokenAsync.mockReset().mockResolvedValue({ data: 'ExponentPushToken[device]' });
  mockApiGet.mockReset().mockResolvedValue({ success: true, data: { webPushPublicKey: 'AQIDBA' } });
  mockApiPost.mockReset().mockResolvedValue({ success: true });
  mockApiDelete.mockReset().mockResolvedValue({ success: true });
  restoreGlobal('window', undefined);
  restoreGlobal('navigator', undefined);
  restoreGlobal('Notification', undefined);
});

afterAll(() => {
  restoreGlobal('window', originalWindow);
  restoreGlobal('navigator', originalNavigator);
  restoreGlobal('Notification', originalNotification);
});

describe('registerCurrentDeviceForPush', () => {
  it('rejects unsupported native platforms and simulators', async () => {
    mockPlatformOs = 'windows';
    await expect(registerCurrentDeviceForPush()).resolves.toMatchObject({ success: false, error: expect.stringContaining('not supported') });
    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();

    mockPlatformOs = 'ios';
    mockConstants.isDevice = false;
    await expect(registerCurrentDeviceForPush()).resolves.toMatchObject({ success: false, error: expect.stringContaining('physical device') });
  });

  it('requests native permission and reports a denial', async () => {
    mockGetPermissionsAsync.mockResolvedValueOnce({ granted: false });
    mockRequestPermissionsAsync.mockResolvedValueOnce({ granted: false });
    await expect(registerCurrentDeviceForPush()).resolves.toMatchObject({ success: false, error: expect.stringContaining('Allow notifications') });
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('requires an Expo project id after permission is granted', async () => {
    mockConstants.expoConfig = null;
    mockConstants.easConfig = null;
    await expect(registerCurrentDeviceForPush()).resolves.toMatchObject({ success: false, error: expect.stringContaining('not configured') });
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('registers Android after configuring its notification channel', async () => {
    await expect(registerCurrentDeviceForPush()).resolves.toEqual({ success: true });
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ name: 'HASHPASS updates' }));
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'expo-project' });
    expect(mockApiPost).toHaveBeenCalledWith('notifications/push-token', expect.objectContaining({
      token: 'ExponentPushToken[device]', platform: 'android',
    }), expect.objectContaining({ retries: 0, skipEventSegment: true }));
  });

  it('uses the EAS project id fallback on iOS and reports API errors', async () => {
    mockPlatformOs = 'ios';
    mockConstants.expoConfig = null;
    mockConstants.easConfig = { projectId: 'eas-project' };
    mockApiPost.mockResolvedValueOnce({ success: false, error: 'API unavailable' });
    await expect(registerCurrentDeviceForPush()).resolves.toEqual({ success: false, error: 'API unavailable' });
    expect(mockSetNotificationChannelAsync).not.toHaveBeenCalled();
    expect(mockGetExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'eas-project' });
  });

  it('registers an existing browser subscription after validating support and settings', async () => {
    mockPlatformOs = 'web';
    const browser = installBrowser({ permission: 'denied', requestPermission: 'granted' });
    const result = await registerCurrentDeviceForPush();
    expect(result).toEqual({ success: true });
    expect(browser.requestPermission).toHaveBeenCalledTimes(1);
    expect(browser.subscribe).not.toHaveBeenCalled();
    expect(mockApiGet).toHaveBeenCalledWith('notifications/push-token', expect.objectContaining({ retries: 0 }));
    expect(mockApiPost).toHaveBeenCalledWith('notifications/push-token', expect.objectContaining({ platform: 'web' }), expect.any(Object));
  });

  it('returns useful browser errors for unsupported, missing configuration, denied permission, and API failure', async () => {
    mockPlatformOs = 'web';
    installBrowser({ serviceWorker: false });
    await expect(registerCurrentDeviceForPush()).resolves.toMatchObject({ success: false, error: expect.stringContaining('not supported') });

    installBrowser();
    mockApiGet.mockResolvedValueOnce({ success: false, error: 'Settings unavailable' });
    await expect(registerCurrentDeviceForPush()).resolves.toEqual({ success: false, error: 'Settings unavailable' });

    mockApiGet.mockResolvedValueOnce({ success: true, data: {} });
    await expect(registerCurrentDeviceForPush()).resolves.toMatchObject({ success: false, error: expect.stringContaining('not configured') });

    installBrowser({ permission: 'default', requestPermission: 'denied' });
    await expect(registerCurrentDeviceForPush()).resolves.toMatchObject({ success: false, error: expect.stringContaining('Allow browser') });
  });

  it('creates a browser subscription, decodes the public key, and reports registration failure', async () => {
    mockPlatformOs = 'web';
    const browser = installBrowser({ permission: 'granted', existingSubscription: false });
    mockApiPost.mockResolvedValueOnce({ success: false });
    await expect(registerCurrentDeviceForPush()).resolves.toMatchObject({ success: false, error: expect.stringContaining('Unable to enable browser') });
    expect(browser.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: new Uint8Array([1, 2, 3, 4]),
    }));
  });
});

describe('disablePushForCurrentAccount', () => {
  it('returns the API error without local browser work', async () => {
    mockApiDelete.mockResolvedValueOnce({ success: false, error: 'Unable to disable' });
    await expect(disablePushForCurrentAccount()).resolves.toEqual({ success: false, error: 'Unable to disable' });
  });

  it('unsubscribes the current web browser after account-wide opt-out', async () => {
    mockPlatformOs = 'web';
    const browser = installBrowser();
    await expect(disablePushForCurrentAccount()).resolves.toEqual({ success: true });
    expect(mockApiDelete).toHaveBeenCalledWith('notifications/push-token', expect.objectContaining({ retries: 0 }));
    expect(browser.subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps a successful server opt-out when the local subscription is stale', async () => {
    mockPlatformOs = 'web';
    const staleSubscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/device', unsubscribe: jest.fn().mockRejectedValue(new Error('stale')) };
    installBrowser({ subscription: staleSubscription });
    await expect(disablePushForCurrentAccount()).resolves.toEqual({ success: true });
  });
});
