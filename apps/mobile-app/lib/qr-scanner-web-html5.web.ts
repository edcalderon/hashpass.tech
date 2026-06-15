/**
 * Reliable web QR scanner using html5-qrcode library
 * This is the most reliable QR scanner for web browsers
 */

import { Platform } from 'react-native';

// Only load on web
if (Platform.OS !== 'web') {
  throw new Error('html5-qrcode scanner is web-only');
}

// Note: We don't use a global error handler here because it interferes with Metro bundler
// Instead, we handle errors locally in try-catch blocks

// Dynamic import to avoid bundling on native
let Html5Qrcode: any = null;
let Html5QrcodeScanner: any = null;

const loadHtml5Qrcode = async () => {
  if (Html5Qrcode && Html5QrcodeScanner) {
    return { Html5Qrcode, Html5QrcodeScanner };
  }

  try {
    const html5QrcodeModule = await import('html5-qrcode');
    Html5Qrcode = html5QrcodeModule.Html5Qrcode;
    Html5QrcodeScanner = html5QrcodeModule.Html5QrcodeScanner;
    return { Html5Qrcode, Html5QrcodeScanner };
  } catch (error) {
    console.error('Failed to load html5-qrcode:', error);
    throw error;
  }
};

export interface Html5QRScanOptions {
  fps?: number; // Frames per second (default: 10)
  qrbox?: { width: number; height: number } | number; // Scanning area
  aspectRatio?: number; // Aspect ratio of camera view
  disableFlip?: boolean; // Disable flip detection
  videoConstraints?: MediaTrackConstraints; // Camera constraints
  supportedScanTypes?: any[]; // Supported scan types
}

export interface Html5QRScanResult {
  text: string;
  result: any;
}

export interface Html5QRScannerCallbacks {
  onScanSuccess: (result: Html5QRScanResult) => void;
  onScanError?: (error: Error) => void;
}

class Html5QRScannerService {
  private scanner: any = null;
  private isScanning: boolean = false;
  private currentElementId: string | null = null;

  /**
   * Check if html5-qrcode is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await loadHtml5Qrcode();
      return typeof window !== 'undefined' && 'navigator' in window && 'mediaDevices' in navigator;
    } catch {
      return false;
    }
  }

  /**
   * Get available camera devices
   */
  async getCameras(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (error) {
      console.error('Error getting cameras:', error);
      return [];
    }
  }

  /**
   * Get the best camera (prefer back camera)
   */
  async getBestCamera(): Promise<string | null> {
    const cameras = await this.getCameras();
    if (cameras.length === 0) return null;

    // Prefer back camera (usually has 'back' or 'environment' in label)
    const backCamera = cameras.find(cam => 
      cam.label.toLowerCase().includes('back') || 
      cam.label.toLowerCase().includes('environment') ||
      cam.label.toLowerCase().includes('rear')
    );

    if (backCamera) {
      return backCamera.deviceId;
    }

    // Fallback to first available camera
    return cameras[0].deviceId;
  }

  /**
   * Start scanning on a video element or container
   */
  async startScanning(
    elementIdOrElement: string | HTMLElement,
    callbacks: Html5QRScannerCallbacks,
    options: Html5QRScanOptions = {}
  ): Promise<{ success: boolean; error?: string }> {
    if (this.isScanning && this.scanner) {
      console.warn('Scanner already running, stopping first...');
      try {
        await this.stopScanning();
      } catch (error: any) {
        // Ignore errors during cleanup - we're about to start fresh anyway
        const errorMsg = error?.message || String(error);
        if (!errorMsg.includes('removeChild') && !errorMsg.includes('not a child')) {
          console.warn('Error stopping previous scanner:', error);
        }
      }
    }

    try {
      const { Html5Qrcode } = await loadHtml5Qrcode();
      
      // Get element
      let element: HTMLElement | null = null;
      if (typeof elementIdOrElement === 'string') {
        element = document.getElementById(elementIdOrElement);
        if (!element) {
          // Try to find by data attribute or class
          element = document.querySelector(`[data-scanner-id="${elementIdOrElement}"]`) as HTMLElement ||
                   document.querySelector(`#${elementIdOrElement}`) as HTMLElement;
        }
      } else {
        element = elementIdOrElement;
      }

      if (!element) {
        throw new Error(`Element not found: ${elementIdOrElement}`);
      }

      // Create scanner instance
      this.scanner = new Html5Qrcode(element.id || 'html5qr-scanner');

      // Get camera ID
      const cameraId = await this.getBestCamera();
      if (!cameraId) {
        throw new Error('No camera available');
      }

      // Default options optimized for performance and reliability
      const scanOptions: Html5QRScanOptions = {
        fps: options.fps || 10, // 10 FPS is good balance
        qrbox: options.qrbox || { width: 250, height: 250 }, // Scanning area
        aspectRatio: options.aspectRatio || 1.0,
        disableFlip: options.disableFlip !== false, // Enable flip detection
        videoConstraints: options.videoConstraints || {
          facingMode: 'environment', // Prefer back camera
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        ...options,
      };

      // Start scanning
      await this.scanner.start(
        cameraId,
        scanOptions,
        (decodedText: string, decodedResult: any) => {
          // Success callback
          callbacks.onScanSuccess({
            text: decodedText,
            result: decodedResult,
          });
        },
        (errorMessage: string) => {
          // Error callback (not fatal, just means no QR found in frame)
          // Only log if it's not a "not found" error
          if (!errorMessage.includes('No QR code') && !errorMessage.includes('NotFoundException')) {
            console.debug('QR scan error (non-fatal):', errorMessage);
          }
        }
      );

      this.isScanning = true;
      this.currentElementId = element.id || 'html5qr-scanner';

      console.log('✅ html5-qrcode scanner started successfully');
      return { success: true };
    } catch (error: any) {
      console.error('Error starting html5-qrcode scanner:', error);
      this.isScanning = false;
      this.scanner = null;
      
      if (callbacks.onScanError) {
        callbacks.onScanError(error);
      }

      return {
        success: false,
        error: error.message || 'Failed to start scanner',
      };
    }
  }

  /**
   * Stop scanning
   * IMPORTANT: This must be called BEFORE React unmounts to prevent DOM conflicts
   */
  async stopScanning(): Promise<void> {
    if (!this.scanner || !this.isScanning) {
      return;
    }

    // Mark as not scanning immediately to prevent re-entry
    this.isScanning = false;
    const scanner = this.scanner;
    const elementId = this.currentElementId;
    this.scanner = null;
    this.currentElementId = null;

    try {
      // Check if element still exists before stopping
      let element: HTMLElement | null = null;
      if (elementId) {
        element = document.getElementById(elementId) ||
                 document.querySelector(`[data-scanner-id="${elementId}"]`) as HTMLElement;
      }

      // Temporarily patch removeChild only for the scanner element to suppress errors
      let originalRemoveChild: ((child: Node) => Node) | null = null;
      if (element && element.removeChild) {
        originalRemoveChild = element.removeChild.bind(element);
        // Patch only this element's removeChild method
        (element as any).removeChild = function(child: Node) {
          try {
            // Try to remove normally
            return originalRemoveChild!(child);
          } catch (e: any) {
            // Suppress "not a child" errors - node may have been removed by html5-qrcode
            if (e.message?.includes('not a child') || 
                e.message?.includes('removeChild') ||
                e.name === 'NotFoundError') {
              console.debug('Suppressed removeChild error for scanner element:', e.message);
              return child; // Return child to satisfy React
            }
            throw e;
          }
        };
      }

      try {
        // Stop the scanner (this stops the camera stream)
        // Wrap in try-catch to suppress any DOM errors from html5-qrcode's internal cleanup
        await Promise.race([
          scanner.stop(),
          // Timeout to prevent hanging if stop() hangs
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Scanner stop timeout')), 2000)
          )
        ]).catch(async (error: any) => {
          // If timeout, try to stop anyway
          if (error.message === 'Scanner stop timeout') {
            try {
              await scanner.stop();
            } catch (e) {
              // Ignore
            }
          }
          throw error;
        });
        console.log('✅ html5-qrcode scanner stopped');
      } catch (stopError: any) {
        // Suppress all DOM-related errors - they're harmless
        const errorMsg = stopError?.message || String(stopError);
        if (!errorMsg.includes('not started') && 
            !errorMsg.includes('removeChild') &&
            !errorMsg.includes('not a child') &&
            !errorMsg.includes('Node.removeChild') &&
            !errorMsg.includes('timeout')) {
          console.warn('Error stopping scanner:', stopError);
        } else {
          console.debug('Suppressed DOM removal error during scanner stop');
        }
      } finally {
        // Restore original removeChild for this element
        if (element && originalRemoveChild) {
          try {
            (element as any).removeChild = originalRemoveChild;
          } catch (e) {
            // Ignore restoration errors
          }
        }
      }

      // Don't call clear() - it tries to remove DOM nodes that React manages
      // Instead, just stop the scanner and let React handle DOM cleanup
      // The clear() method is problematic with React's virtual DOM
    } catch (error: any) {
      // Catch any other errors and suppress DOM-related errors
      const errorMsg = error?.message || String(error);
      if (!errorMsg.includes('removeChild') &&
          !errorMsg.includes('not a child') &&
          !errorMsg.includes('not started') &&
          !errorMsg.includes('Node.removeChild')) {
        console.error('Error stopping scanner:', error);
      } else {
        console.debug('Suppressed DOM removal error:', errorMsg);
      }
    }
  }

  /**
   * Check camera permissions
   */
  async checkPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { granted: false, canAskAgain: false };
      }

      // Try to get permission
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop immediately to release camera
      stream.getTracks().forEach(track => track.stop());
      return { granted: true, canAskAgain: true };
    } catch (error: any) {
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return { granted: false, canAskAgain: true };
      }
      return { granted: false, canAskAgain: false };
    }
  }

  /**
   * Request camera permissions
   */
  async requestPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop immediately to release camera
      stream.getTracks().forEach(track => track.stop());
      return { granted: true, canAskAgain: true };
    } catch (error: any) {
      console.error('Error requesting camera permission:', error);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        return { granted: false, canAskAgain: true };
      }
      return { granted: false, canAskAgain: false };
    }
  }

  /**
   * Get scanner status
   */
  getStatus(): { isScanning: boolean; hasScanner: boolean } {
    return {
      isScanning: this.isScanning,
      hasScanner: this.scanner !== null,
    };
  }
}

export const html5QRScanner = new Html5QRScannerService();

