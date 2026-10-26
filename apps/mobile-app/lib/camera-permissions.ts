import { Platform, Linking, Alert } from 'react-native';
import { BarCodeScanner } from './barcode-scanner-compat';
import { detectWebBrowser, probeWebVideoInputs, subscribeToWebCameraSignals } from './web-camera-support';

export type CameraPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'blocked';

export interface CameraPermissionResult {
  status: CameraPermissionStatus;
  canAskAgain: boolean;
  message?: string;
  /** Browser label on web (for example "Firefox") so UI copy can name it. */
  browser?: string;
}

const WEB_CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
};

/**
 * Comprehensive camera permission management system
 */
class CameraPermissionManager {
  /**
   * Session memory of a successful web grant. Safari and embedded browsers do
   * not expose camera permission through the Permissions API, so without this
   * cache reopening the scanner would show the request screen again even
   * though the browser will not re-prompt.
   */
  private webPermissionGrantedOnce = false;

  private webPermissionWatchers: Array<() => void> = [];
  /**
   * Get current camera permission status
   * Uses fresh check to avoid browser cache issues
   */
  async getPermissionStatus(_forceRefresh: boolean = false): Promise<CameraPermissionResult> {
    try {
      if (Platform.OS === 'web') {
        return this.getWebPermissionStatus();
      }

      const { status, canAskAgain } = await BarCodeScanner.getPermissionsAsync();

      return {
        status: status as CameraPermissionStatus,
        canAskAgain: canAskAgain ?? true,
        message: this.getStatusMessage(status as CameraPermissionStatus, canAskAgain ?? true),
      };
    } catch (error: any) {
      console.error('Error getting camera permission status:', error);
      if (Platform.OS === 'web') {
        return this.reconcileWebPermissionFailure(error);
      }
      return {
        status: 'undetermined',
        canAskAgain: true,
        message: 'Unable to check camera permission status',
      };
    }
  }

  /**
   * Request camera permission
   * Forces fresh request to avoid browser cache issues
   */
  async requestPermission(forceFresh: boolean = false): Promise<CameraPermissionResult> {
    try {
      if (Platform.OS === 'web') {
        // Browsers only show the permission prompt from a user gesture. Do not
        // call Expo's native permission API or probe the camera before this
        // request; both can leave web stuck in a denied/undetermined state.
        return this.requestWebPermission();
      }

      const currentStatus = await this.getPermissionStatus(forceFresh);
      
      // If already granted, verify it's actually working
      if (currentStatus.status === 'granted') {
        const verified = await this.verifyPermissionStatus('granted');
        if (verified.status === 'granted') {
          return verified;
        }
        // If verification failed, continue to request
      }

      // If blocked or denied without canAskAgain, show settings prompt
      if (currentStatus.status === 'denied' && !currentStatus.canAskAgain) {
        return {
          status: 'blocked',
          canAskAgain: false,
          message: 'Camera permission is blocked. Please enable it in device settings.',
        };
      }

      // Request permission with fresh check
      const { status, canAskAgain } = await BarCodeScanner.requestPermissionsAsync();
      
      // Verify the permission actually works
      const verified = await this.verifyPermissionStatus(status as CameraPermissionStatus);
      
      return {
        status: verified.status,
        canAskAgain: canAskAgain ?? true,
        message: verified.message || this.getStatusMessage(status as CameraPermissionStatus, canAskAgain ?? true),
      };
    } catch (error: any) {
      console.error('Error requesting camera permission:', error);
      
      // On web, provide more helpful error message
      if (Platform.OS === 'web') {
        return this.reconcileWebPermissionFailure(error);
      }
      
      return {
        status: 'undetermined',
        canAskAgain: true,
        message: 'Error requesting camera permission',
      };
    }
  }

  /**
   * Check if camera is in use by another application
   */
  async isCameraInUse(): Promise<{ inUse: boolean; message?: string }> {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        // Never prompt from a status check. Only probe after the browser has
        // already reported camera permission as granted.
        const permissionState = await this.getWebPermissionState();
        if (permissionState !== 'granted') return { inUse: false };

        const stream = await navigator.mediaDevices.getUserMedia(WEB_CAMERA_CONSTRAINTS);
        // If successful, camera is available
        stream.getTracks().forEach(track => track.stop());
        return { inUse: false };
      } catch (mediaError: any) {
        // Check for camera in use errors
        if (this.isCameraInUseError(mediaError)) {
          return {
            inUse: true,
            message: 'Camera is currently being used by another application. Please close other apps using the camera and try again.',
          };
        }
        // Other errors - not necessarily in use
        return { inUse: false };
      }
    }
    
    // For native platforms, we can't easily detect without trying to access
    return { inUse: false };
  }

  /**
   * Check if an error indicates camera is in use
   */
  private isCameraInUseError(error: any): boolean {
    const errorName = error?.name || '';
    const errorMessage = (error?.message || '').toLowerCase();
    
    // Common error names that indicate camera in use
    const inUseErrorNames = [
      'NotReadableError',
      'TrackStartError',
    ];
    
    // Common error messages that indicate camera in use
    const inUseErrorMessages = [
      'device is already in use',
      'camera is already in use',
      'device busy',
      'resource busy',
      'could not start video source',
      'failed to allocate video source',
    ];
    
    // Check error name
    if (inUseErrorNames.some(name => errorName.includes(name))) {
      return true;
    }
    
    // Check error message
    if (inUseErrorMessages.some(msg => errorMessage.includes(msg))) {
      return true;
    }
    
    // Check for specific error codes (browser-specific)
    return false;
  }

  /**
   * Verify that a granted permission actually works
   */
  private async verifyPermissionStatus(status: CameraPermissionStatus): Promise<CameraPermissionResult> {
    if (status !== 'granted') {
      return {
        status,
        canAskAgain: true,
        message: this.getStatusMessage(status, true),
      };
    }

    // On web, requestPermission already opened and closed a real media stream.
    // A second getUserMedia call here can create a second prompt or race the
    // scanner on Safari/iOS, so use the browser permission state only.
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        const permissionState = await this.getWebPermissionState();
        if (permissionState === 'denied') {
          return {
            status: 'blocked',
            canAskAgain: false,
            message: 'Camera permission is blocked. Allow camera access in your browser settings.',
          };
        }
        return {
          status: 'granted',
          canAskAgain: false,
          message: 'Camera permission is granted and working',
        };
      } catch (mediaError: any) {
        console.warn('Permission verification failed:', mediaError);
        return this.reconcileWebPermissionFailure(mediaError);
      }
    }

    // For native platforms, assume granted status is correct
    return {
      status: 'granted',
      canAskAgain: false,
      message: 'Camera permission is granted',
    };
  }

  /**
   * Check if permission is granted
   */
  async isGranted(): Promise<boolean> {
    const result = await this.getPermissionStatus();
    return result.status === 'granted';
  }

  /**
   * Open device settings to allow user to grant permission manually
   */
  async openSettings(): Promise<boolean> {
    try {
      // Handle web browsers differently - they can't open system settings
      if (Platform.OS === 'web') {
        // For web, show instructions instead
        this.showWebSettingsInstructions();
        return false;
      }

      if (Platform.OS === 'ios') {
        await Linking.openURL('app-settings:');
        return true;
      } else if (Platform.OS === 'android') {
        // Try app-specific settings first
        try {
          await Linking.openSettings();
          return true;
        } catch (e) {
          // Fallback to general settings
          await Linking.openURL('settings:');
          return true;
        }
      } else {
        // Unknown platform - try general settings
        await Linking.openURL('settings:');
        return true;
      }
    } catch (error) {
      console.error('Error opening settings:', error);
      // On web or if all else fails, show instructions
      if (Platform.OS === 'web') {
        this.showWebSettingsInstructions();
      } else {
        // Try one more fallback
        try {
          await Linking.openURL('settings:');
          return true;
        } catch (fallbackError) {
          console.error('Error opening fallback settings:', fallbackError);
          return false;
        }
      }
      return false;
    }
  }

  /**
   * Show comprehensive web browser-specific instructions for camera permissions
   * Includes both granting and revoking instructions
   */
  private showWebSettingsInstructions(): void {
    const { id, label, isIOS } = detectWebBrowser();
    let browserName = label;
    let grantInstructions = '';
    let revokeInstructions = '';
    let iconLocation = '';

    // Every iOS browser shares WebKit's permission sheet and Safari's
    // Settings flow, regardless of the vendor printed on the icon.
    const safariFlow = isIOS || id === 'safari';
    if (safariFlow) {
      browserName = isIOS ? `${label} (iOS uses Safari's camera settings)` : 'Safari';
      grantInstructions = `To GRANT camera permission:\n1. Safari menu → Settings → Websites\n2. Select "Camera" from sidebar\n3. Find this website → Set to "Allow"\n4. Refresh the page`;
      revokeInstructions = `To REVOKE camera permission:\n1. Safari menu → Settings → Websites\n2. Select "Camera" from sidebar\n3. Find this website → Set to "Deny" or "Ask"\n4. Refresh the page`;
    } else if (id === 'firefox') {
      iconLocation = 'the lock icon (🔒) or camera icon in the address bar';
      grantInstructions = `To GRANT camera permission:\n1. Click ${iconLocation}\n2. Go to the "Permissions" section\n3. Find "Camera" and select "Allow"\n4. Try scanning again\n\nIf the setting is missing: Settings → Privacy & Security → Permissions → Camera → Find this site → Allow`;
      revokeInstructions = `To REVOKE camera permission:\n1. Click ${iconLocation}\n2. Go to the "Permissions" section\n3. Find "Camera" and click "Remove"\n4. Refresh the page`;
    } else if (id === 'samsung') {
      iconLocation = 'the lock or camera icon in the address bar';
      grantInstructions = `To GRANT camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Allow"\n4. Try scanning again\n\nOr: Menu → Settings → Site permissions → Camera → Find this site → Allow`;
      revokeInstructions = `To REVOKE camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Block"\n4. Refresh the page`;
    } else if (id === 'edge') {
      iconLocation = 'the lock icon (🔒) or camera icon (📷) in the address bar';
      grantInstructions = `To GRANT camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Allow"\n4. Try scanning again\n\nOr: Settings → Cookies and site permissions → Camera → Find this site → Allow`;
      revokeInstructions = `To REVOKE camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Block" or "Ask"\n4. Refresh the page`;
    } else {
      // Chrome and other Chromium-based browsers.
      iconLocation = 'the lock icon (🔒) or camera icon (📷) in the address bar';
      grantInstructions = `To GRANT camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Allow"\n4. Try scanning again\n\nOr: Settings → Privacy and security → Site Settings → Camera → Find this site → Allow`;
      revokeInstructions = `To REVOKE camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Block" or "Ask"\n4. Refresh the page`;
    }

    const fullInstructions = `${grantInstructions}\n\n${revokeInstructions}`;

    Alert.alert(
      `Camera Permission Settings - ${browserName}`,
      fullInstructions,
      [
        {
          text: 'Refresh Page',
          onPress: () => {
            // Reload the page to check new permissions
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          },
        },
        {
          text: 'Close',
          style: 'cancel',
        },
      ]
    );
  }

  /**
   * Show alert to guide user to settings
   */
  showSettingsAlert(onOpenSettings?: () => void): void {
    const isWeb = Platform.OS === 'web';
    
    if (isWeb) {
      // On web, directly show comprehensive instructions
      this.showWebSettingsInstructions();
      return;
    }
    
    // On native, show alert with settings option
    Alert.alert(
      'Camera Permission Required',
      'Camera permission is required to scan QR codes. Please enable it in your device settings.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Open Settings',
          onPress: async () => {
            try {
              if (onOpenSettings) {
                await onOpenSettings();
              } else {
                await this.openSettings();
              }
            } catch (error) {
              console.error('Error in settings alert:', error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }

  /**
   * Handle permission request with automatic retry and settings prompt
   * Includes cache-busting for web browsers and camera in-use detection
   */
  async requestWithFallback(forceFresh: boolean = false): Promise<CameraPermissionResult> {
    if (Platform.OS === 'web') {
      try {
        return await this.requestPermission(true);
      } catch (error) {
        // A failed browser request must be reconciled with the browser's
        // current permission state before the UI decides whether to retry.
        return this.reconcileWebPermissionFailure(error);
      }
    }

    const shouldForceFresh = forceFresh;

    const cameraCheck = await this.isCameraInUse();
    if (cameraCheck.inUse) {
      return {
        status: 'undetermined',
        canAskAgain: true,
        message: cameraCheck.message || 'Camera is being used by another application. Please close other apps using the camera and try again.',
      };
    }
    
    let result = await this.requestPermission(shouldForceFresh);
    
    // If blocked, show settings alert
    if (result.status === 'blocked' || (result.status === 'denied' && !result.canAskAgain)) {
      return {
        ...result,
        message: 'Please enable camera permission in device settings to scan QR codes.',
      };
    }
    
    return result;
  }

  /**
   * Force refresh permission status (clears cache)
   */
  async forceRefreshPermission(): Promise<CameraPermissionResult> {
    return this.getPermissionStatus(true);
  }

  /**
   * Watch the browser's own camera signals while a permission screen is
   * visible. When the user flips Allow from the address bar (or plugs in a
   * camera), the callback fires so the UI can retry without a page reload.
   * Unsupported browsers (no Permissions API and no devicechange) simply
   * never fire.
   */
  watchWebPermission(onChange: (result: CameraPermissionResult) => void): () => void {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return () => undefined;

    const unsubscribe = subscribeToWebCameraSignals(async (signal) => {
      if (signal.type === 'permission-changed') {
        if (signal.state === 'granted') {
          this.webPermissionGrantedOnce = true;
          onChange({
            status: 'granted',
            canAskAgain: false,
            message: 'Camera permission is granted',
          });
        } else if (signal.state === 'denied') {
          this.webPermissionGrantedOnce = false;
          onChange({
            status: 'blocked',
            canAskAgain: false,
            message: 'Camera permission is blocked. Allow camera access in your browser settings.',
          });
        }
        return;
      }
      // A camera appearing (or disappearing) changes what a retry can do,
      // so surface the refreshed permission state.
      onChange(await this.getWebPermissionStatus());
    });

    this.webPermissionWatchers.push(unsubscribe);
    return unsubscribe;
  }

  /** Stop every watcher started through watchWebPermission. */
  stopWatchingWebPermission(): void {
    this.webPermissionWatchers.forEach((unsubscribe) => unsubscribe());
    this.webPermissionWatchers = [];
  }

  /**
   * Show instructions to revoke camera permissions
   * Note: Permissions cannot be revoked programmatically - user must do it in browser settings
   */
  showRevokePermissionInstructions(): void {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    let browserName = 'your browser';
    let instructions = '';

    if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
      browserName = 'Chrome';
      instructions = `To revoke camera permission:\n\n1. Click the lock icon (🔒) or camera icon (📷) in the address bar\n2. Find "Camera" in the permissions list\n3. Select "Block" or "Ask"\n4. Refresh this page\n\nOr go to:\nSettings → Privacy and security → Site Settings → Camera → Find this site → Change to "Block"`;
    } else if (userAgent.includes('firefox')) {
      browserName = 'Firefox';
      instructions = `To revoke camera permission:\n\n1. Click the lock icon (🔒) in the address bar\n2. Click "More Information"\n3. Go to "Permissions" tab\n4. Find "Camera" and click "Remove"\n5. Refresh this page\n\nOr go to:\nSettings → Privacy & Security → Permissions → Camera → Find this site → Remove`;
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      browserName = 'Safari';
      instructions = `To revoke camera permission:\n\n1. Go to Safari menu → Settings (or Preferences)\n2. Click on "Websites" tab\n3. Select "Camera" from the left sidebar\n4. Find this website in the list\n5. Change it to "Deny" or "Ask"\n6. Refresh this page`;
    } else if (userAgent.includes('edg')) {
      browserName = 'Edge';
      instructions = `To revoke camera permission:\n\n1. Click the lock icon (🔒) or camera icon (📷) in the address bar\n2. Find "Camera" in the permissions\n3. Select "Block" or "Ask"\n4. Refresh this page\n\nOr go to:\nSettings → Cookies and site permissions → Camera → Find this site → Change to "Block"`;
    } else {
      instructions = `To revoke camera permission:\n\n1. Look for a lock, info, or camera icon in your browser's address bar\n2. Click on it to access site permissions\n3. Find "Camera" in the permissions settings\n4. Change it to "Block" or "Ask"\n5. Refresh this page`;
    }

    Alert.alert(
      `Revoke Camera Permission in ${browserName}`,
      instructions,
      [
        {
          text: 'I\'ve Revoked It',
          onPress: () => {
            // Refresh the page to check new permission status
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  }

  /**
   * Attempt to revoke/clear camera permission (web only)
   * Note: This doesn't actually revoke the permission, but clears any cached state
   * and shows instructions for manual revocation
   */
  async revokePermission(): Promise<void> {
    if (Platform.OS === 'web') {
      // On web, we can't actually revoke permissions programmatically
      // But we can clear any cached state and show instructions
      try {
        // Clear any localStorage cache if we're storing permission state
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('camera_permission_status');
          localStorage.removeItem('camera_permission_cache');
        }
        
        // Show instructions to user
        this.showRevokePermissionInstructions();
      } catch (error) {
        console.error('Error clearing permission cache:', error);
        // Still show instructions even if cache clear fails
        this.showRevokePermissionInstructions();
      }
    } else {
      // On native, permissions are managed by OS - can't revoke programmatically
      Alert.alert(
        'Revoke Camera Permission',
        'To revoke camera permission, please go to your device settings:\n\niOS: Settings → Privacy → Camera → Find this app → Toggle off\nAndroid: Settings → Apps → This App → Permissions → Camera → Deny',
        [
          {
            text: 'OK',
            style: 'default',
          },
        ]
      );
    }
  }

  /**
   * Get user-friendly status message
   */
  private getStatusMessage(status: CameraPermissionStatus, canAskAgain: boolean): string {
    if (Platform.OS === 'web') {
      switch (status) {
        case 'granted':
          return 'Camera permission is granted';
        case 'denied':
        case 'blocked':
          return 'Camera permission is blocked. Allow camera access in your browser settings.';
        case 'undetermined':
          return 'Camera permission has not been requested yet';
      }
    }

    switch (status) {
      case 'granted':
        return 'Camera permission is granted';
      case 'denied':
        if (canAskAgain) {
          return 'Camera permission was denied. You can request it again.';
        }
        return 'Camera permission is blocked. Please enable it in device settings.';
      case 'undetermined':
        return 'Camera permission has not been requested yet';
      case 'blocked':
        return 'Camera permission is permanently blocked. Please enable it in device settings.';
      default:
        return 'Unknown permission status';
    }
  }

  /**
   * Reset permission state (for testing/debugging)
   * Note: This doesn't actually revoke the permission on the device,
   * but can be used to force re-request in development
   */
  async resetPermissionCheck(): Promise<void> {
    // On web, we can't actually reset, but we can clear any cached state
    if (Platform.OS === 'web') {
      // Clear any localStorage cache if needed
      try {
        localStorage.removeItem('camera_permission_status');
      } catch (e) {
        // Ignore
      }
    }
    // On native, permissions are managed by the OS and can't be reset programmatically
    // User must go to settings to revoke/grant
  }

  private async getWebPermissionState(): Promise<PermissionState | null> {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null;

    try {
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return permission.state;
    } catch {
      // Safari and embedded browsers may not expose camera in Permissions API.
      return null;
    }
  }

  /**
   * Reconcile a failed browser camera operation with navigator.permissions.
   * Browsers can reject getUserMedia for reasons unrelated to permission
   * (missing camera, busy device, unsupported constraints), so never report a
   * generic denial without checking the browser state first.
   */
  private async reconcileWebPermissionFailure(error: any): Promise<CameraPermissionResult> {
    const permissionState = await this.getWebPermissionState();
    if (permissionState === 'denied') {
      return {
        status: 'blocked',
        canAskAgain: false,
        message: 'Camera permission is blocked. Allow camera access in your browser settings.',
      };
    }

    return {
      status: 'undetermined',
      canAskAgain: true,
      message: this.getWebCameraErrorMessage(error),
    };
  }

  private async getWebPermissionStatus(): Promise<CameraPermissionResult> {
    if (typeof window === 'undefined' || !window.isSecureContext) {
      return {
        status: 'blocked',
        canAskAgain: false,
        message: 'Camera access requires HTTPS or localhost.',
      };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        status: 'blocked',
        canAskAgain: false,
        message: 'This browser does not expose camera access. Use HTTPS or localhost in a supported browser.',
      };
    }

    const permissionState = await this.getWebPermissionState();
    if (permissionState === 'granted') {
      return { status: 'granted', canAskAgain: false, message: 'Camera permission is granted' };
    }
    if (permissionState === 'denied') {
      return {
        status: 'blocked',
        canAskAgain: false,
        message: 'Camera permission is blocked. Allow camera access in your browser settings.',
      };
    }
    if (this.webPermissionGrantedOnce) {
      // Browsers without a readable permission state only re-prompt after
      // the user changes the site setting, so a session grant is the best
      // available signal that the camera stays allowed.
      return { status: 'granted', canAskAgain: false, message: 'Camera permission is granted' };
    }

    return {
      status: 'undetermined',
      canAskAgain: true,
      message: 'Camera permission has not been requested yet',
    };
  }

  private async requestWebPermission(): Promise<CameraPermissionResult> {
    if (typeof window === 'undefined' || !window.isSecureContext) {
      return {
        status: 'blocked',
        canAskAgain: false,
        message: 'Camera access requires HTTPS or localhost.',
      };
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return {
        status: 'blocked',
        canAskAgain: false,
        message: 'This browser does not expose camera access. Use HTTPS or localhost in a supported browser.',
      };
    }

    // Firefox lists no devices before the first grant, so an empty list must
    // stay inconclusive; only a conclusive device list with no camera avoids
    // a pointless prompt.
    const deviceProbe = await probeWebVideoInputs();
    if (deviceProbe.outcome === 'no-camera') {
      return {
        status: 'blocked',
        canAskAgain: false,
        message: 'No camera was found. Connect a camera and try again.',
      };
    }

    try {
      const stream = await this.openWebCameraStream(WEB_CAMERA_CONSTRAINTS);
      stream.getTracks().forEach(track => track.stop());
      this.webPermissionGrantedOnce = true;
      return {
        status: 'granted',
        canAskAgain: false,
        message: 'Camera permission is granted and working',
      };
    } catch (error: any) {
      const permissionState = await this.getWebPermissionState();
      if (permissionState === 'denied') {
        this.webPermissionGrantedOnce = false;
      }
      return {
        status: permissionState === 'denied' ? 'blocked' : 'undetermined',
        canAskAgain: permissionState !== 'denied',
        message: this.getWebCameraErrorMessage(error),
      };
    }
  }

  /**
   * Opens a web camera stream, retrying once with bare constraints when the
   * browser cannot satisfy the preferred ones. Firefox and some drivers can
   * raise OverconstrainedError for the ideal-facing-mode profile even when a
   * camera is attached and usable.
   */
  private async openWebCameraStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    try {
      return await getUserMedia(constraints);
    } catch (error: any) {
      if (error?.name === 'OverconstrainedError') {
        return await getUserMedia({ audio: false, video: true });
      }
      throw error;
    }
  }

  private getWebCameraErrorMessage(error: any): string {
    const browser = detectWebBrowser();
    switch (error?.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        if (browser.id === 'firefox') {
          return 'Camera permission was denied or dismissed. Click the camera or lock icon in the address bar, choose Allow, then try again.';
        }
        return 'Camera permission was denied. Allow camera access in the browser address-bar settings and try again.';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'No camera was found. Connect a camera and try again.';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'The camera is busy or unavailable. Close other camera apps and try again.';
      case 'OverconstrainedError':
        return 'The selected camera does not support these settings. Try another camera or browser.';
      case 'SecurityError':
        return 'Camera access was blocked by the browser security policy. Use HTTPS or localhost.';
      default:
        return `Unable to access the camera${error?.message ? `: ${error.message}` : '.'}`;
    }
  }
}

export const cameraPermissionManager = new CameraPermissionManager();
export default cameraPermissionManager;
