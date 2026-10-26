export type WebBrowserId =
  | 'chrome'
  | 'chrome-ios'
  | 'firefox'
  | 'firefox-ios'
  | 'safari'
  | 'edge'
  | 'samsung'
  | 'other';

export interface WebBrowserInfo {
  id: WebBrowserId;
  label: string;
  isIOS: boolean;
  isMobile: boolean;
}

export interface WebCameraCapabilities {
  secureContext: boolean;
  hasGetUserMedia: boolean;
  hasPermissionsApi: boolean;
  hasEnumerateDevices: boolean;
}
export type WebCameraSignal =
  | { type: 'permission-changed'; state: PermissionState | null }
  | { type: 'devices-changed' };

export interface WebVideoDeviceProbe {
  /**
   * - `unavailable`: no getUserMedia support at all.
   * - `no-camera`: the browser listed devices and none is a camera.
   * - `inconclusive`: enumeration is unsupported or returned nothing
   *   (Firefox lists no devices before the first permission grant), so a
   *   real getUserMedia attempt is the only reliable probe.
   * - `has-camera`: at least one videoinput exists.
   */
  outcome: 'unavailable' | 'no-camera' | 'inconclusive' | 'has-camera';
}
