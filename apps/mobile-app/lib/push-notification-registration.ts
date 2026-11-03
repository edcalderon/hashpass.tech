import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiClient } from './api-client';

function decodeApplicationServerKey(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = globalThis.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function registerBrowserDeviceForPush() {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) return { success: false as const, error: 'Browser push is not supported here. Install HASHPASS as an app and try again.' };

  const settings = await apiClient.get('notifications/push-token', { skipEventSegment: true, retries: 0 });
  if (!settings.success) return { success: false as const, error: settings.error || 'Unable to load browser push settings.' };
  const payload = settings.data as { webPushPublicKey?: string | null } | undefined;
  if (!payload?.webPushPublicKey) return { success: false as const, error: 'Browser push is not configured for this environment yet.' };

  let permission = window.Notification.permission;
  if (permission !== 'granted') permission = await window.Notification.requestPermission();
  if (permission !== 'granted') return { success: false as const, error: 'Allow browser notifications to enable push.' };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeApplicationServerKey(payload.webPushPublicKey),
  });
  const response = await apiClient.post('notifications/push-token', {
    token: subscription.endpoint,
    platform: 'web',
    subscription: subscription.toJSON(),
  }, { skipEventSegment: true, retries: 0 });
  return response.success
    ? { success: true as const }
    : { success: false as const, error: response.error || 'Unable to enable browser push notifications.' };
}

export async function registerCurrentDeviceForPush() {
  if (Platform.OS === 'web') return registerBrowserDeviceForPush();
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    return { success: false as const, error: 'Push notifications are not supported on this platform.' };
  }
  if (!Constants.isDevice) {
    return { success: false as const, error: 'A physical device is required to enable push notifications.' };
  }

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    return { success: false as const, error: 'Allow notifications in your device settings to enable push.' };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) {
    return { success: false as const, error: 'Push delivery is not configured for this app build yet.' };
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'HASHPASS updates',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const response = await apiClient.post('notifications/push-token', {
    token,
    platform: Platform.OS,
  }, { skipEventSegment: true, retries: 0 });
  if (!response.success) {
    return { success: false as const, error: response.error || 'Unable to enable push notifications.' };
  }
  return { success: true as const };
}

export async function disablePushForCurrentAccount() {
  const response = await apiClient.delete('notifications/push-token', {
    skipEventSegment: true,
    retries: 0,
  });
  if (!response.success) return { success: false as const, error: response.error || 'Unable to disable push notifications.' };
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch {
      // The server opt-out is already saved; a stale local browser subscription cannot receive messages.
    }
  }
  return { success: true as const };
}
