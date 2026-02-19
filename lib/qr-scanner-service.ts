/**
 * Professional QR Scanner Service
 * Cross-platform QR scanning with fallbacks and optimizations
 * 
 * Supports:
 * - iOS (native)
 * - Android (native)
 * - Web (with @zxing/browser fallback)
 */

import { Platform } from 'react-native';
import { BarCodeScanner, BarCodeScannerResult } from 'expo-barcode-scanner';
import { cameraPermissionManager } from './camera-permissions';

// Dynamic import for web scanners to avoid bundling on native
let webQRScannerFallback: any = null; // ZXing (primary)
let html5QRScanner: any = null; // html5-qrcode (fallback)

// Type definition for web QR scan results
interface WebQRScanResult {
  text: string;
  format: string;
  timestamp: number;
}

// Only import web scanners on web platform
// Using .web.ts extension ensures Metro only resolves this on web
if (Platform.OS === 'web') {
  try {
    // Primary: @zxing/browser (most robust)
    const webFallbackModule = require('./qr-scanner-web-fallback.web');
    webQRScannerFallback = webFallbackModule.webQRScannerFallback;
  } catch (e) {
    console.warn('ZXing web scanner not available:', e);
  }

  try {
    // Fallback: html5-qrcode
    const html5Module = require('./qr-scanner-web-html5.web');
    html5QRScanner = html5Module.html5QRScanner;
  } catch (e) {
    console.warn('html5-qrcode scanner fallback not available:', e);
  }
}

export interface QRScanOptions {
  /** Only scan QR codes (default: true) */
  qrOnly?: boolean;
  /** Scan interval throttle in ms (default: 1000) */
  scanThrottle?: number;
  /** Enable haptic feedback on scan (default: true) */
  hapticFeedback?: boolean;
  /** Enable sound feedback on scan (default: false) */
  soundFeedback?: boolean;
  /** Auto-process scanned QR (default: false) */
  autoProcess?: boolean;
}

export interface QRScanCallback {
  onScan: (result: BarCodeScannerResult) => void | Promise<void>;
  onError?: (error: Error) => void;
  onPermissionDenied?: () => void;
}

class QRScannerService {
  private lastScanTime = 0;
  private scanThrottle = 1000; // Default 1 second throttle
  private isScanning = false;
  private useWebFallback = false;
  private webFallbackActive = false; // ZXing scanner active
  private html5ScannerActive = false; // html5-qrcode fallback active
  private currentVideoElement: HTMLElement | string | null = null;

  /**
   * Check if QR scanning is supported on this platform
   */
  isSupported(): boolean {
    if (Platform.OS === 'web') {
      // On web, check both expo-barcode-scanner and ZXing fallback
      return (
        (typeof BarCodeScanner !== 'undefined') ||
        (webQRScannerFallback && webQRScannerFallback.isAvailable())
      );
    }
    // On native platforms, BarCodeScanner should always be available if imported
    return typeof BarCodeScanner !== 'undefined';
  }

  /**
   * Enable web fallback (for when expo-barcode-scanner fails on web)
   */
  enableWebFallback(): void {
    if (Platform.OS === 'web') {
      this.useWebFallback = true;
    }
  }

  /**
   * Check if web fallback should be used
   */
  shouldUseWebFallback(): boolean {
    return Platform.OS === 'web' && this.useWebFallback && webQRScannerFallback && webQRScannerFallback.isAvailable();
  }

  /**
   * Request camera permissions with proper error handling
   */
  async requestPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    try {
      const result = await cameraPermissionManager.requestWithFallback(true);
      return {
        granted: result.status === 'granted',
        canAskAgain: result.canAskAgain ?? true,
      };
    } catch (error) {
      console.error('Error requesting camera permissions:', error);
      return { granted: false, canAskAgain: false };
    }
  }

  /**
   * Check current camera permission status
   */
  async checkPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    try {
      const result = await cameraPermissionManager.getPermissionStatus(true);
      return {
        granted: result.status === 'granted',
        canAskAgain: result.canAskAgain ?? true,
      };
    } catch (error) {
      console.error('Error checking camera permissions:', error);
      return { granted: false, canAskAgain: false };
    }
  }

  /**
   * Create a throttled scan handler
   */
  createScanHandler(
    callback: QRScanCallback,
    options: QRScanOptions = {}
  ): ((result: BarCodeScannerResult) => void) | undefined {
    const throttle = options.scanThrottle ?? this.scanThrottle;
    const hapticEnabled = options.hapticFeedback !== false;

    return (result: BarCodeScannerResult) => {
      // Quick early returns to avoid blocking camera rendering
      // Only process QR codes if qrOnly is true (default)
      if (options.qrOnly !== false && result.type !== BarCodeScanner.Constants.BarCodeType.qr) {
        return;
      }

      // Throttle scans to prevent excessive processing
      const now = Date.now();
      if (now - this.lastScanTime < throttle) {
        return;
      }

      // Prevent duplicate scans
      if (this.isScanning) {
        return;
      }

      this.lastScanTime = now;
      this.isScanning = true;

      // Use requestIdleCallback or setTimeout to process scan asynchronously
      // This prevents blocking the camera rendering thread
      const processScan = () => {
        // Haptic feedback (if available) - non-blocking
        if (hapticEnabled && Platform.OS !== 'web') {
          try {
            // Note: expo-haptics would need to be imported if available
            // import * as Haptics from 'expo-haptics';
            // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          } catch (e) {
            // Haptics not available, continue silently
          }
        }

        // Process scan asynchronously to not block camera
        Promise.resolve(callback.onScan(result))
          .catch((error) => {
            console.error('Error in scan callback:', error);
            callback.onError?.(error);
          })
          .finally(() => {
            // Reset scanning flag after a delay
            setTimeout(() => {
              this.isScanning = false;
            }, throttle);
          });
      };

      // Use setTimeout with 0 delay to process scan in next event loop tick
      // This ensures camera rendering continues smoothly
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(processScan, { timeout: 100 });
      } else {
        setTimeout(processScan, 0);
      }
    };
  }

  /**
   * Get recommended camera type for platform
   */
  getRecommendedCameraType(): 'front' | 'back' {
    // On web, back camera is more reliable
    // On mobile, back camera is standard for QR scanning
    return 'back';
  }

  /**
   * Get recommended bar code types
   */
  getBarCodeTypes(): string[] {
    return [BarCodeScanner.Constants.BarCodeType.qr];
  }

  /**
   * Validate QR code data format
   */
  parseQRData(data: string): {
    token?: string;
    type?: string;
    isValid: boolean;
    raw: string;
  } {
    if (!data || typeof data !== 'string') {
      console.warn('⚠️ parseQRData: Invalid input data');
      return { isValid: false, raw: data || '' };
    }

    const trimmed = data.trim();
    console.log('🔍 Parsing QR data:', trimmed.substring(0, 100));

    try {
      // Try parsing as JSON first (most common format)
      const parsed = JSON.parse(trimmed);
      console.log('📦 Parsed as JSON:', parsed);
      
      if (parsed.token) {
        console.log('✅ Found token in JSON:', parsed.token);
        return {
          token: parsed.token,
          type: parsed.type || 'hashpass_qr',
          isValid: true,
          raw: data,
        };
      }
      
      // Check if it's a hashpass_qr format
      if (parsed.type === 'hashpass_qr' && parsed.token) {
        console.log('✅ Found hashpass_qr token:', parsed.token);
        return {
          token: parsed.token,
          type: parsed.type,
          isValid: true,
          raw: data,
        };
      }
      
      console.warn('⚠️ JSON parsed but no token found:', parsed);
    } catch (jsonError) {
      // Not JSON, try other formats
      console.log('📝 Not JSON, trying other formats...');
      
      // Try URL parsing
      if (trimmed.includes('token=')) {
        try {
          const url = new URL(trimmed);
          const token = url.searchParams.get('token');
          if (token) {
            console.log('✅ Found token in URL:', token);
            return {
              token,
              type: 'hashpass_qr',
              isValid: true,
              raw: data,
            };
          }
        } catch (urlError) {
          // Invalid URL, continue to next check
          console.log('⚠️ URL parsing failed:', urlError);
        }
      }

      // Check if it looks like a raw token (starts with QR-)
      if (trimmed.startsWith('QR-')) {
        console.log('✅ Detected raw QR token format');
        return {
          token: trimmed,
          type: 'hashpass_qr',
          isValid: true,
          raw: data,
        };
      }

      // Assume any string longer than 10 chars is a token
      if (trimmed.length > 10) {
        console.log('✅ Treating as raw token (length > 10)');
        return {
          token: trimmed,
          type: 'hashpass_qr',
          isValid: true,
          raw: data,
        };
      }
      
      console.warn('⚠️ Could not parse QR data, length:', trimmed.length);
    }

    return {
      isValid: false,
      raw: data,
    };
  }

  /**
   * Reset scan state (useful after processing a scan)
   */
  async reset(): Promise<void> {
    this.lastScanTime = 0;
    this.isScanning = false;
    
    // Stop web fallback if active
    await this.stopWebFallback();
  }

  /**
   * Start web fallback scanning
   * Tries @zxing/browser first (most robust), falls back to html5-qrcode if needed
   */
  async startWebFallback(
    videoElement: HTMLVideoElement | string,
    onScan: (result: WebQRScanResult) => void,
    onError?: (error: Error) => void
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.shouldUseWebFallback()) {
      return { success: false, error: 'Web fallback not available' };
    }

    this.currentVideoElement = videoElement;

    // Try @zxing/browser first (most robust)
    if (webQRScannerFallback) {
      try {
        const isAvailable = webQRScannerFallback.isAvailable();
        if (isAvailable) {
          this.webFallbackActive = true;
          const result = await webQRScannerFallback.startScanning(
            onScan,
            onError,
            {
              videoElement,
              scanInterval: this.scanThrottle,
              continuous: true,
            }
          );
          if (result.success) {
            console.log('✅ Using @zxing/browser scanner (primary)');
            return { success: true };
          }
          // If ZXing fails, try html5-qrcode fallback
          console.warn('ZXing scanner failed, trying html5-qrcode fallback:', result.error);
        }
      } catch (error: any) {
        console.warn('ZXing scanner failed, trying html5-qrcode fallback:', error);
      }
    }

    // Fallback to html5-qrcode if ZXing failed or not available
    if (html5QRScanner) {
      try {
        const isAvailable = await html5QRScanner.isAvailable();
        if (isAvailable) {
          // Get element ID or create one
          let elementId: string;
          let element: HTMLElement | null = null;

          if (typeof videoElement === 'string') {
            elementId = videoElement;
            element = document.getElementById(elementId) || 
                     document.querySelector(`[data-scanner-id="${elementId}"]`) as HTMLElement;
          } else {
            // Create or use existing ID
            if (!videoElement.id) {
              videoElement.id = `html5qr-scanner-${Date.now()}`;
            }
            elementId = videoElement.id;
            element = videoElement;
          }

          // If element doesn't exist, create a container
          if (!element) {
            const container = document.createElement('div');
            container.id = elementId;
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.position = 'relative';
            container.setAttribute('data-scanner-id', elementId);
            
            // Try to find parent container
            const parent = typeof videoElement === 'string' 
              ? document.querySelector(`[data-testid="scanner-wrapper"]`) ||
                document.querySelector('.scanner-wrapper')
              : videoElement.parentElement;
            
            if (parent) {
              parent.appendChild(container);
              element = container;
            } else {
              throw new Error('Could not find container for scanner');
            }
          }

          const result = await html5QRScanner.startScanning(
            element,
            {
              onScanSuccess: (scanResult: any) => {
                // Convert html5-qrcode result to WebQRScanResult format
                const webResult: WebQRScanResult = {
                  text: scanResult.text,
                  format: scanResult.result?.result?.format?.formatName || 'QR_CODE',
                  timestamp: Date.now(),
                };
                onScan(webResult);
              },
              onScanError: (error: Error) => {
                // Non-fatal errors (like "no QR found") are expected
                if (error.message && 
                    !error.message.includes('No QR code') && 
                    !error.message.includes('NotFoundException')) {
                  console.error('html5-qrcode scan error:', error);
                  if (onError) {
                    onError(error);
                  }
                }
              },
            },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0,
            }
          );

          if (result.success) {
            this.html5ScannerActive = true;
            this.webFallbackActive = true;
            console.log('✅ Using html5-qrcode scanner (fallback)');
            return { success: true };
          }
        }
      } catch (error: any) {
        console.error('html5-qrcode fallback also failed:', error);
        return { success: false, error: error.message || 'Both scanners failed' };
      }
    }

    return { success: false, error: 'No web scanner available' };
  }

  /**
   * Stop web fallback scanning
   */
  async stopWebFallback(): Promise<void> {
    // Stop ZXing scanner (primary)
    if (this.webFallbackActive && webQRScannerFallback) {
      try {
        webQRScannerFallback.stopScanning();
        this.webFallbackActive = false;
      } catch (error: any) {
        // Ignore DOM removal errors
        const errorMsg = error?.message || String(error);
        if (!errorMsg.includes('removeChild') &&
            !errorMsg.includes('not a child')) {
          console.error('Error stopping ZXing scanner:', error);
        }
        this.webFallbackActive = false;
      }
    }

    // Stop html5-qrcode scanner (fallback)
    if (this.html5ScannerActive && html5QRScanner) {
      try {
        await html5QRScanner.stopScanning();
        this.html5ScannerActive = false;
      } catch (error: any) {
        // Ignore DOM removal errors - React may have already cleaned up
        const errorMsg = error?.message || String(error);
        if (!errorMsg.includes('removeChild') &&
            !errorMsg.includes('not a child')) {
          console.error('Error stopping html5-qrcode scanner:', error);
        }
        this.html5ScannerActive = false;
      }
    }

    this.currentVideoElement = null;
  }

  /**
   * Check web fallback permissions
   */
  async checkWebFallbackPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    if (!this.shouldUseWebFallback()) {
      return { granted: false, canAskAgain: false };
    }

    // Try ZXing first (primary)
    if (webQRScannerFallback) {
      try {
        return webQRScannerFallback.checkPermissions();
      } catch (error) {
        console.warn('ZXing permission check failed:', error);
      }
    }

    // Fallback to html5-qrcode
    if (html5QRScanner) {
      try {
        return await html5QRScanner.checkPermissions();
      } catch (error) {
        console.warn('html5-qrcode permission check failed:', error);
      }
    }

    return { granted: false, canAskAgain: false };
  }

  /**
   * Request web fallback permissions
   */
  async requestWebFallbackPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    if (!this.shouldUseWebFallback()) {
      return { granted: false, canAskAgain: false };
    }

    // Try ZXing first (primary)
    if (webQRScannerFallback) {
      try {
        return webQRScannerFallback.requestPermissions();
      } catch (error) {
        console.warn('ZXing permission request failed:', error);
      }
    }

    // Fallback to html5-qrcode
    if (html5QRScanner) {
      try {
        return await html5QRScanner.requestPermissions();
      } catch (error) {
        console.warn('html5-qrcode permission request failed:', error);
      }
    }

    return { granted: false, canAskAgain: false };
  }
}

// Export singleton instance
export const qrScannerService = new QRScannerService();

// Export types
export type { BarCodeScannerResult };


