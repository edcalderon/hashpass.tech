import { Platform } from 'react-native';
import type {
  WebBrowserInfo,
  WebCameraCapabilities,
  WebCameraSignal,
  WebVideoDeviceProbe,
} from '../types/web-camera.types';

/**
 * Web-only camera capability and signal helpers.
 *
 * Browsers differ wildly in what they expose: Safari has no usable
 * `navigator.permissions` camera query, Firefox before v125 throws on it,
 * and iOS browsers all share WebKit's prompt regardless of their vendor.
 * These helpers centralize that detection so the permission manager can
 * pick the right flow per browser instead of assuming Chrome behaviour.
 */

/** UA-based browser detection. Order matters: vendor tokens overlap. */
export function detectWebBrowser(userAgent?: string): WebBrowserInfo {
  const ua = (userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent ?? '' : '')).toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isMobile = isIOS || /android|mobile/.test(ua);

  // iOS browsers all use WebKit and Safari's permission UI, so their
  // instructions must describe Safari's Settings flow, not the vendor's.
  let id: WebBrowserInfo['id'] = 'other';
  let label = 'your browser';
  if (/fxios/.test(ua)) {
    id = 'firefox-ios';
    label = 'Firefox for iOS';
  } else if (/crios/.test(ua)) {
    id = 'chrome-ios';
    label = 'Chrome for iOS';
  } else if (/edg\//.test(ua) || /edge\//.test(ua)) {
    id = 'edge';
    label = 'Edge';
  } else if (/samsungbrowser/.test(ua)) {
    id = 'samsung';
    label = 'Samsung Internet';
  } else if (/firefox/.test(ua)) {
    id = 'firefox';
    label = 'Firefox';
  } else if (/chrome/.test(ua)) {
    id = 'chrome';
    label = 'Chrome';
  } else if (/safari/.test(ua)) {
    id = 'safari';
    label = 'Safari';
  }

  return { id, label, isIOS, isMobile };
}

/** Whether this runtime can enumerate media devices at all. */
export function getWebCameraCapabilities(): WebCameraCapabilities {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
    return { secureContext: false, hasGetUserMedia: false, hasPermissionsApi: false, hasEnumerateDevices: false };
  }
  return {
    secureContext: typeof window !== 'undefined' && window.isSecureContext === true,
    hasGetUserMedia: typeof navigator.mediaDevices?.getUserMedia === 'function',
    hasPermissionsApi: typeof navigator.permissions?.query === 'function',
    hasEnumerateDevices: typeof navigator.mediaDevices?.enumerateDevices === 'function',
  };
}

/**
 * Enumerate video inputs without ever prompting. An empty device list is
 * inconclusive rather than "no camera" because Firefox filters the list
 * until the user grants camera access once.
 */
export async function probeWebVideoInputs(): Promise<WebVideoDeviceProbe> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
    return { outcome: 'unavailable' };
  }
  if (typeof navigator.mediaDevices?.enumerateDevices !== 'function') {
    return { outcome: 'inconclusive' };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!Array.isArray(devices) || devices.length === 0) return { outcome: 'inconclusive' };
    const hasVideo = devices.some((device) => (device as MediaDeviceInfo).kind === 'videoinput');
    return { outcome: hasVideo ? 'has-camera' : 'no-camera' };
  } catch {
    return { outcome: 'inconclusive' };
  }
}

/**
 * Watch the browser's own camera signals while the permission screen is
 * visible: the Permissions API state (supported on Chrome, Edge and Firefox
 * 125+; Safari throws, in which case nothing is watched) plus hot-plugged
 * cameras. Returns a no-op unsubscribe for unsupported browsers so callers
 * never need to branch.
 */
export function subscribeToWebCameraSignals(onSignal: (signal: WebCameraSignal) => void): () => void {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return () => undefined;

  const unsubscribers: Array<() => void> = [];

  if (typeof navigator.permissions?.query === 'function') {
    let disposed = false;
    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((status) => {
        if (disposed) return;
        const handler = () => onSignal({ type: 'permission-changed', state: status.state });
        status.addEventListener?.('change', handler);
        unsubscribers.push(() => status.removeEventListener?.('change', handler));
      })
      .catch(() => {
        // Safari and older Firefox builds do not expose the camera permission
        // through the Permissions API; the device watcher below still runs.
      });
    unsubscribers.push(() => {
      disposed = true;
    });
  }

  if (typeof navigator.mediaDevices?.addEventListener === 'function') {
    const handler = () => onSignal({ type: 'devices-changed' });
    navigator.mediaDevices.addEventListener('devicechange', handler);
    unsubscribers.push(() => navigator.mediaDevices?.removeEventListener?.('devicechange', handler));
  }

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
