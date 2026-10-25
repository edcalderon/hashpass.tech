/**
 * Simplified Web QR Scanner using @zxing/browser
 * ZXing handles video stream attachment automatically
 */

import { Platform } from 'react-native';

export interface WebQRScanOptions {
  /** Video element ID or element */
  videoElement?: HTMLVideoElement | string;
  /** Scan interval in ms (default: 500) */
  scanInterval?: number;
  /** Enable continuous scanning (default: true) */
  continuous?: boolean;
}

export interface WebQRScanResult {
  text: string;
  format: string;
  timestamp: number;
}

class WebQRScannerFallback {
  private reader: any = null;
  private isScanning = false;
  private scanGeneration = 0;
  private videoElement: HTMLVideoElement | null = null;
  private zxingModule: any = null;

  /* istanbul ignore next -- exercised by browser camera smoke tests */
  isAvailable(): boolean {
    return Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia);
  }

  private async loadZXing() {
    if (this.zxingModule) return this.zxingModule;

    if (Platform.OS !== 'web') {
      throw new Error('ZXing is only available on web');
    }

    try {
      const zxingBrowser = await import('@zxing/browser');
      this.zxingModule = {
        BrowserMultiFormatReader: zxingBrowser.BrowserMultiFormatReader,
      };
      return this.zxingModule;
    } catch (error) {
      console.error('Failed to load ZXing:', error);
      throw new Error('ZXing library not available');
    }
  }

  private async initializeReader() {
    if (this.reader) return this.reader;

      const { BrowserMultiFormatReader } = await this.loadZXing();
      this.reader = new BrowserMultiFormatReader();
    return this.reader;
  }

  /* istanbul ignore next -- exercised by browser camera smoke tests */
  async startScanning(
    onScan: (result: WebQRScanResult) => void,
    onError?: (error: Error) => void,
    options: WebQRScanOptions = {}
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isAvailable()) {
      return { success: false, error: 'Web fallback not available' };
    }

    if (this.isScanning) {
      return { success: false, error: 'Already scanning' };
    }

    const generation = this.scanGeneration;
    const isCurrent = (element?: HTMLVideoElement) =>
      generation === this.scanGeneration &&
      Boolean(element && document.body.contains(element));

    try {
      const reader = await this.initializeReader();

      // Get or create video element - SIMPLIFIED
      let videoElement: HTMLVideoElement;

      if (options.videoElement instanceof HTMLVideoElement) {
        // Direct video element provided - use it
        videoElement = options.videoElement;
      } else if (typeof options.videoElement === 'string') {
        // String ID - find wrapper element
        const wrapper = document.getElementById(options.videoElement) ||
                       document.querySelector(`[data-testid="${options.videoElement}"]`) ||
                       document.querySelector(`.${options.videoElement}`);
        
        if (!wrapper) {
          throw new Error(`Scanner wrapper not found: ${options.videoElement}`);
          }

        // Check if wrapper is already a video element
        if (wrapper instanceof HTMLVideoElement) {
          videoElement = wrapper;
        } else {
          // Find or create video element inside wrapper
          let existingVideo = wrapper.querySelector('video') as HTMLVideoElement;
          if (existingVideo) {
            videoElement = existingVideo;
          } else {
            videoElement = document.createElement('video');
            wrapper.appendChild(videoElement);
          }
        }
      } else {
        // No element provided - find wrapper and create video
        const wrapper = document.querySelector('[data-testid="scanner-wrapper"]') || 
                       document.querySelector('.scanner-wrapper') ||
                       document.getElementById('scanner-wrapper');
        if (!wrapper) {
          throw new Error('Scanner wrapper not found');
        }

        // Find or create video element inside wrapper
        let existingVideo = wrapper.querySelector('video') as HTMLVideoElement;
        if (existingVideo) {
          videoElement = existingVideo;
        } else {
          videoElement = document.createElement('video');
          wrapper.appendChild(videoElement);
        }
      }

      if (!isCurrent(videoElement)) {
        return { success: false, error: 'Scanner view closed before camera started' };
      }

      // Set DOM properties as well as attributes. iOS Safari ignores some
      // autoplay attributes unless playsInline/muted are properties.
      videoElement.style.width = '100%';
      videoElement.style.height = '100%';
      videoElement.style.objectFit = 'cover';
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.muted = true;
      videoElement.setAttribute('autoplay', 'true');
      videoElement.setAttribute('playsinline', 'true');
      videoElement.setAttribute('muted', 'true');

      this.videoElement = videoElement;

      // Let the browser choose the best camera. Using decodeFromVideoDevice
      // with an enumerated id before permission is granted returns no devices
      // on desktop Safari/Chrome and is the main reason web scanning stalls.
      const continuous = options.continuous !== false;

      if (!isCurrent(videoElement)) {
        this.videoElement = null;
        return { success: false, error: 'Scanner view closed before camera started' };
      }

      this.isScanning = true;
      await reader.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoElement,
        (result: any, error: any) => {
          if (result) {
            onScan({
              text: result.getText(),
              format: result.getBarcodeFormat().toString(),
              timestamp: Date.now(),
            });
            
            if (!continuous) {
              this.stopScanning();
            }
          } else if (error) {
            // Ignore NotFoundException (normal when no QR code detected)
            const isNotFoundException = 
              error?.name === 'NotFoundException' ||
              error?.constructor?.name === 'NotFoundException' ||
              (error?.message && typeof error.message === 'string' && 
               (error.message.includes('NotFoundException') || error.message.includes('not found')));
            
            if (!isNotFoundException) {
            console.warn('ZXing scan error:', error);
            onError?.(error);
            }
          }
        }
      );

      if (!isCurrent(videoElement)) {
        this.stopScanning();
        return { success: false, error: 'Scanner view closed before camera started' };
      }

      return { success: true };
    } catch (error: any) {
      const elementMissing = !this.videoElement || !document.body.contains(this.videoElement);
      const stale = generation !== this.scanGeneration ||
        error?.message?.includes('object can not be found') ||
        (error?.name === 'NotFoundError' && elementMissing);
      this.isScanning = false;
      if (stale) {
        this.stopScanning();
        return { success: false, error: 'Scanner view closed before camera started' };
      }
      return { 
        success: false, 
        error: error.message || 'Failed to start scanner' 
      };
    }
  }

  /* istanbul ignore next -- exercised by browser camera smoke tests */
  stopScanning(): void {
    this.scanGeneration += 1;
    this.isScanning = false;

    if (this.reader) {
      try {
        this.reader.reset();
      } catch (e) {
        // Ignore reset errors
      }
      this.reader = null;
    }
    
    if (this.videoElement) {
      // Stop video stream
      if (this.videoElement.srcObject) {
        const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
        this.videoElement.srcObject = null;
      }
      this.videoElement = null;
    }
    
    this.zxingModule = null;
  }
}

export const webQRScannerFallback = new WebQRScannerFallback();
