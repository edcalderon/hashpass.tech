/**
 * Performance utilities for memory and performance optimization
 */

import { useCallback, useRef, useEffect } from 'react';

/**
 * Debounce function to limit function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function to limit function calls
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Hook to detect memory pressure and cleanup
 */
export function useMemoryCleanup() {
  const cleanupRef = useRef<(() => void)[]>([]);

  const registerCleanup = useCallback((cleanup: () => void) => {
    cleanupRef.current.push(cleanup);
  }, []);

  useEffect(() => {
    return () => {
      // Run all cleanup functions on unmount
      cleanupRef.current.forEach(cleanup => {
        try {
          cleanup();
        } catch (error) {
          console.warn('Cleanup error:', error);
        }
      });
      cleanupRef.current = [];
    };
  }, []);

  return registerCleanup;
}

/**
 * Image cache manager for better memory management
 */
class ImageCacheManager {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private maxSize: number = 50; // Max cached images
  private maxAge: number = 30 * 60 * 1000; // 30 minutes

  get(url: string): any | null {
    const cached = this.cache.get(url);
    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(url);
      return null;
    }

    return cached.data;
  }

  set(url: string, data: any): void {
    // Remove oldest if cache is full
    if (this.cache.size >= this.maxSize) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      this.cache.delete(oldestKey);
    }

    this.cache.set(url, { data, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

export const imageCacheManager = new ImageCacheManager();

// Cleanup cache periodically
if (typeof window !== 'undefined') {
  setInterval(() => {
    imageCacheManager.cleanup();
  }, 5 * 60 * 1000); // Every 5 minutes
}

/**
 * Lazy load images with intersection observer
 */
export function useLazyImage(src: string | null | undefined, options?: IntersectionObserverInit) {
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const imgRef = React.useRef<HTMLImageElement | null>(null);

  React.useEffect(() => {
    if (!src) {
      setImageSrc(null);
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cached = imageCacheManager.get(src);
    if (cached) {
      setImageSrc(src);
      setIsLoading(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setImageSrc(src);
            imageCacheManager.set(src, true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.01, ...options }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [src]);

  return { imageSrc, isLoading, imgRef };
}

/**
 * Batch state updates to reduce re-renders
 */
export function useBatchedUpdates() {
  const updatesRef = useRef<Map<string, any>>(new Map());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const batchUpdate = useCallback((key: string, value: any, callback: (updates: Map<string, any>) => void) => {
    updatesRef.current.set(key, value);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(new Map(updatesRef.current));
      updatesRef.current.clear();
      timeoutRef.current = null;
    }, 16); // One frame
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return batchUpdate;
}


