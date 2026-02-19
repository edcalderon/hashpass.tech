import { BarCodeScanner } from 'expo-barcode-scanner';
import { Platform, Linking, Alert } from 'react-native';

export type CameraPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'blocked';

export interface CameraPermissionResult {
  status: CameraPermissionStatus;
  canAskAgain: boolean;
  message?: string;
}

/**
 * Comprehensive camera permission management system
 */
class CameraPermissionManager {
  /**
   * Get current camera permission status
   * Uses fresh check to avoid browser cache issues
   */
  async getPermissionStatus(forceRefresh: boolean = false): Promise<CameraPermissionResult> {
    try {
      // On web, clear any cached permission state if force refresh
      if (Platform.OS === 'web' && forceRefresh) {
        // Try to clear any cached state
        try {
          // Force a new permission check by requesting and immediately checking
          await BarCodeScanner.requestPermissionsAsync();
        } catch (e) {
          // Ignore errors - we just want to trigger a fresh check
        }
      }

      const { status, canAskAgain } = await BarCodeScanner.getPermissionsAsync();
      
      // Additional validation for web browsers
      if (Platform.OS === 'web') {
        // Sometimes browsers report 'granted' but camera still doesn't work
        // Try to validate by checking if we can actually access media devices
        if (status === 'granted' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
          try {
            // Quick check if we can enumerate devices (this validates permission)
            const devices = await navigator.mediaDevices.enumerateDevices();
            const hasCamera = devices.some(device => device.kind === 'videoinput');
            
            if (!hasCamera) {
              // Permission might be granted but no camera found
              return {
                status: 'undetermined',
                canAskAgain: true,
                message: 'No camera device found. Please check your camera connection.',
              };
            }
          } catch (mediaError) {
            // If we can't enumerate devices, permission might not actually be granted
            console.warn('Could not enumerate media devices:', mediaError);
            return {
              status: 'denied',
              canAskAgain: true,
              message: 'Camera permission check failed. Please try granting permission again.',
            };
          }
        }
      }
      
      return {
        status: status as CameraPermissionStatus,
        canAskAgain: canAskAgain ?? true,
        message: this.getStatusMessage(status as CameraPermissionStatus, canAskAgain ?? true),
      };
    } catch (error: any) {
      console.error('Error getting camera permission status:', error);
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
      // On web, clear browser cache first if forcing fresh
      if (Platform.OS === 'web' && forceFresh) {
        // Try to clear any cached permission state
        try {
          // Force browser to re-evaluate permission by making a fresh request
          // without checking status first
          const { status, canAskAgain } = await BarCodeScanner.requestPermissionsAsync();
          
          // Verify the result
          const verified = await this.verifyPermissionStatus(status as CameraPermissionStatus);
          return verified;
        } catch (requestError) {
          console.error('Error in fresh permission request:', requestError);
        }
      }

      // First check current status (with force refresh if needed)
      const currentStatus = await this.getPermissionStatus(forceFresh);
      
      // If already granted, verify it's actually working
      if (currentStatus.status === 'granted') {
        const verified = await this.verifyPermissionStatus('granted');
        if (verified.status === 'granted') {
          return verified;
        }
        // If verification failed, continue to request
      }

      // On web, if blocked/denied, show instructions instead of trying to request again
      if (Platform.OS === 'web' && (currentStatus.status === 'denied' || currentStatus.status === 'blocked')) {
        return {
          status: 'blocked',
          canAskAgain: false,
          message: 'Camera permission is blocked. Please enable it in your browser settings.',
        };
      }

      // If blocked or denied without canAskAgain, show settings prompt
      if (currentStatus.status === 'denied' && !currentStatus.canAskAgain) {
        return {
          status: 'blocked',
          canAskAgain: false,
          message: Platform.OS === 'web' 
            ? 'Camera permission is blocked. Please enable it in your browser settings.'
            : 'Camera permission is blocked. Please enable it in device settings.',
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
        return {
          status: 'undetermined',
          canAskAgain: true,
          message: 'Unable to request camera permission. Please try refreshing the page or check your browser settings.',
        };
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
        // Try to get user media - if it fails with certain errors, camera might be in use
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
      'OverconstrainedError', // Sometimes indicates device busy
    ];
    
    // Common error messages that indicate camera in use
    const inUseErrorMessages = [
      'device is already in use',
      'camera is already in use',
      'device busy',
      'resource busy',
      'could not start video source',
      'failed to allocate video source',
      'permission denied', // Sometimes means device is locked by another app
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
    if (error?.constraint === 'deviceId' || error?.constraint === 'facingMode') {
      // These constraints failing might indicate device busy
      return true;
    }
    
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

    // On web, verify we can actually access the camera
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.mediaDevices) {
      try {
        // Check if camera is in use first
        const cameraCheck = await this.isCameraInUse();
        if (cameraCheck.inUse) {
          return {
            status: 'undetermined',
            canAskAgain: true,
            message: cameraCheck.message || 'Camera is being used by another application.',
          };
        }

        // Try to get user media (this validates permission)
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        // Immediately stop the stream - we just wanted to verify access
        stream.getTracks().forEach(track => track.stop());
        
        return {
          status: 'granted',
          canAskAgain: false,
          message: 'Camera permission is granted and working',
        };
      } catch (mediaError: any) {
        console.warn('Permission verification failed:', mediaError);
        
        // Check if camera is in use
        if (this.isCameraInUseError(mediaError)) {
          return {
            status: 'undetermined',
            canAskAgain: true,
            message: 'Camera is currently being used by another application. Please close other apps using the camera and try again.',
          };
        }
        
        // If getUserMedia fails, permission might not actually be granted
        if (mediaError.name === 'NotAllowedError' || mediaError.name === 'PermissionDeniedError') {
          return {
            status: 'denied',
            canAskAgain: true,
            message: 'Camera permission appears to be denied. Please grant permission again.',
          };
        }
        
        if (mediaError.name === 'NotFoundError' || mediaError.name === 'DevicesNotFoundError') {
          return {
            status: 'undetermined',
            canAskAgain: true,
            message: 'No camera device found. Please check your camera connection.',
          };
        }
        
        // Other errors - might be temporary
        return {
          status: 'granted',
          canAskAgain: false,
          message: 'Camera permission granted (verification incomplete)',
        };
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
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    let browserName = 'your browser';
    let grantInstructions = '';
    let revokeInstructions = '';
    let iconLocation = '';

    if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
      browserName = 'Chrome';
      iconLocation = 'the lock icon (🔒) or camera icon (📷) in the address bar';
      grantInstructions = `To GRANT camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Allow"\n4. Refresh the page`;
      revokeInstructions = `To REVOKE camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Block" or "Ask"\n4. Refresh the page\n\nOr: Settings → Privacy → Site Settings → Camera → Find this site → Block`;
    } else if (userAgent.includes('firefox')) {
      browserName = 'Firefox';
      iconLocation = 'the lock icon (🔒) or information icon (i) in the address bar';
      grantInstructions = `To GRANT camera permission:\n1. Click ${iconLocation}\n2. Click "More Information" or "Permissions" tab\n3. Find "Camera" and select "Allow"\n4. Refresh the page`;
      revokeInstructions = `To REVOKE camera permission:\n1. Click ${iconLocation}\n2. Click "More Information"\n3. Go to "Permissions" tab\n4. Find "Camera" and click "Remove"\n5. Refresh the page\n\nOr: Settings → Privacy → Permissions → Camera → Find this site → Remove`;
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      browserName = 'Safari';
      grantInstructions = `To GRANT camera permission:\n1. Safari menu → Settings → Websites\n2. Select "Camera" from sidebar\n3. Find this website → Set to "Allow"\n4. Refresh the page`;
      revokeInstructions = `To REVOKE camera permission:\n1. Safari menu → Settings → Websites\n2. Select "Camera" from sidebar\n3. Find this website → Set to "Deny" or "Ask"\n4. Refresh the page`;
    } else if (userAgent.includes('edg')) {
      browserName = 'Edge';
      iconLocation = 'the lock icon (🔒) or camera icon (📷) in the address bar';
      grantInstructions = `To GRANT camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Allow"\n4. Refresh the page`;
      revokeInstructions = `To REVOKE camera permission:\n1. Click ${iconLocation}\n2. Find "Camera" in permissions\n3. Select "Block" or "Ask"\n4. Refresh the page\n\nOr: Settings → Cookies → Camera → Find this site → Block`;
    } else {
      iconLocation = 'a lock, info, or camera icon in your browser\'s address bar';
      grantInstructions = `To GRANT camera permission:\n1. Look for ${iconLocation}\n2. Click to access site permissions\n3. Find "Camera" → Set to "Allow"\n4. Refresh the page`;
      revokeInstructions = `To REVOKE camera permission:\n1. Look for ${iconLocation}\n2. Click to access site permissions\n3. Find "Camera" → Set to "Block" or "Ask"\n4. Refresh the page`;
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
    // On web, always force fresh to avoid cache issues
    const shouldForceFresh = Platform.OS === 'web' || forceFresh;
    
    // First check if camera is in use
    const cameraCheck = await this.isCameraInUse();
    if (cameraCheck.inUse) {
      return {
        status: 'undetermined',
        canAskAgain: true,
        message: cameraCheck.message || 'Camera is being used by another application. Please close other apps using the camera and try again.',
      };
    }
    
    let result = await this.requestPermission(shouldForceFresh);
    
    // If status is stuck or unclear, try forcing a fresh check
    if (Platform.OS === 'web' && result.status === 'undetermined') {
      console.log('Retrying with fresh permission check...');
      // Wait a bit and retry
      await new Promise(resolve => setTimeout(resolve, 300));
      result = await this.requestPermission(true);
    }
    
    // If blocked, show settings alert
    if (result.status === 'blocked' || (result.status === 'denied' && !result.canAskAgain)) {
      return {
        ...result,
        message: Platform.OS === 'web'
          ? 'Please enable camera permission in your browser settings to scan QR codes.'
          : 'Please enable camera permission in device settings to scan QR codes.',
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
}

export const cameraPermissionManager = new CameraPermissionManager();
export default cameraPermissionManager;

