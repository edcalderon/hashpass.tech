/**
 * Memory management utilities to prevent memory leaks and optimize performance
 */

/**
 * Cleanup manager for subscriptions and timers
 */
class MemoryManager {
  private subscriptions: Map<string, { cleanup: () => void; timestamp: number }> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private maxSubscriptions: number = 20; // Max concurrent subscriptions
  private maxAge: number = 60 * 60 * 1000; // 1 hour

  /**
   * Register a subscription with cleanup function
   */
  registerSubscription(id: string, cleanup: () => void): void {
    // Cleanup oldest if limit reached
    if (this.subscriptions.size >= this.maxSubscriptions) {
      this.cleanupOldest();
    }

    // Remove existing if present
    if (this.subscriptions.has(id)) {
      this.subscriptions.get(id)?.cleanup();
    }

    this.subscriptions.set(id, {
      cleanup,
      timestamp: Date.now(),
    });
  }

  /**
   * Unregister a subscription
   */
  unregisterSubscription(id: string): void {
    const subscription = this.subscriptions.get(id);
    if (subscription) {
      try {
        subscription.cleanup();
      } catch (error) {
        console.warn(`Error cleaning up subscription ${id}:`, error);
      }
      this.subscriptions.delete(id);
    }
  }

  /**
   * Register a timer
   */
  registerTimer(id: string, timer: NodeJS.Timeout): void {
    // Clear existing timer if present
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id)!);
    }
    this.timers.set(id, timer);
  }

  /**
   * Clear a timer
   */
  clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  /**
   * Cleanup oldest subscriptions
   */
  private cleanupOldest(): void {
    const sorted = Array.from(this.subscriptions.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Remove oldest 20%
    const toRemove = Math.ceil(this.subscriptions.size * 0.2);
    for (let i = 0; i < toRemove && i < sorted.length; i++) {
      const [id, { cleanup }] = sorted[i];
      try {
        cleanup();
      } catch (error) {
        console.warn(`Error cleaning up old subscription ${id}:`, error);
      }
      this.subscriptions.delete(id);
    }
  }

  /**
   * Cleanup expired subscriptions
   */
  cleanupExpired(): void {
    const now = Date.now();
    for (const [id, { cleanup, timestamp }] of this.subscriptions.entries()) {
      if (now - timestamp > this.maxAge) {
        try {
          cleanup();
        } catch (error) {
          console.warn(`Error cleaning up expired subscription ${id}:`, error);
        }
        this.subscriptions.delete(id);
      }
    }
  }

  /**
   * Cleanup all subscriptions and timers
   */
  cleanupAll(): void {
    // Cleanup all subscriptions
    for (const [id, { cleanup }] of this.subscriptions.entries()) {
      try {
        cleanup();
      } catch (error) {
        console.warn(`Error cleaning up subscription ${id}:`, error);
      }
    }
    this.subscriptions.clear();

    // Clear all timers
    for (const [id, timer] of this.timers.entries()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * Get current memory stats
   */
  getStats() {
    return {
      subscriptions: this.subscriptions.size,
      timers: this.timers.size,
      maxSubscriptions: this.maxSubscriptions,
    };
  }
}

export const memoryManager = new MemoryManager();

// Periodic cleanup
if (typeof window !== 'undefined') {
  setInterval(() => {
    memoryManager.cleanupExpired();
  }, 10 * 60 * 1000); // Every 10 minutes
}

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    memoryManager.cleanupAll();
  });
}


