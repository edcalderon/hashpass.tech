/**
 * Dynamic feature loading system for HashPass white-label platform
 * Allows loading features on-demand based on event configuration
 */

import React from 'react';
import { FEATURES, FeatureConfig, isFeatureEnabled } from '../config/features';
import { getCurrentEvent } from './event-detector';

export interface FeatureModule {
  id: string;
  component: React.ComponentType<any>;
  api?: any;
  utils?: any;
  config?: any;
}

export class FeatureLoader {
  private loadedFeatures: Map<string, FeatureModule> = new Map();
  private loadingPromises: Map<string, Promise<FeatureModule>> = new Map();

  /**
   * Load a feature module dynamically
   */
  async loadFeature(featureId: string): Promise<FeatureModule | null> {
    // Check if feature is enabled
    if (!isFeatureEnabled(featureId)) {
      console.warn(`Feature ${featureId} is not enabled for this event`);
      return null;
    }

    // Return cached feature if already loaded
    if (this.loadedFeatures.has(featureId)) {
      return this.loadedFeatures.get(featureId)!;
    }

    // Return existing loading promise if already loading
    if (this.loadingPromises.has(featureId)) {
      return this.loadingPromises.get(featureId)!;
    }

    // Start loading the feature
    const loadingPromise = this.loadFeatureModule(featureId);
    this.loadingPromises.set(featureId, loadingPromise);

    try {
      const feature = await loadingPromise;
      this.loadedFeatures.set(featureId, feature);
      this.loadingPromises.delete(featureId);
      return feature;
    } catch (error) {
      console.error(`Failed to load feature ${featureId}:`, error);
      this.loadingPromises.delete(featureId);
      return null;
    }
  }

  /**
   * Load multiple features in parallel
   */
  async loadFeatures(featureIds: string[]): Promise<FeatureModule[]> {
    const promises = featureIds.map(id => this.loadFeature(id));
    const results = await Promise.allSettled(promises);
    
    return results
      .filter((result): result is PromiseFulfilledResult<FeatureModule> => 
        result.status === 'fulfilled' && result.value !== null
      )
      .map(result => result.value);
  }

  /**
   * Preload features for better performance
   */
  async preloadFeatures(featureIds: string[]): Promise<void> {
    await this.loadFeatures(featureIds);
  }

  /**
   * Get loaded feature
   */
  getFeature(featureId: string): FeatureModule | null {
    return this.loadedFeatures.get(featureId) || null;
  }

  /**
   * Check if feature is loaded
   */
  isFeatureLoaded(featureId: string): boolean {
    return this.loadedFeatures.has(featureId);
  }

  /**
   * Unload a feature to free memory
   */
  unloadFeature(featureId: string): void {
    this.loadedFeatures.delete(featureId);
  }

  /**
   * Get all loaded features
   */
  getLoadedFeatures(): string[] {
    return Array.from(this.loadedFeatures.keys());
  }

  /**
   * Load feature module based on feature ID
   */
  private async loadFeatureModule(featureId: string): Promise<FeatureModule> {
    const feature = FEATURES[featureId];
    if (!feature) {
      throw new Error(`Feature ${featureId} not found`);
    }

    // Dynamic imports based on feature type
    switch (feature.category) {
      case 'core':
        return this.loadCoreFeature(featureId);
      case 'event':
        return this.loadEventFeature(featureId);
      case 'premium':
        return this.loadPremiumFeature(featureId);
      default:
        throw new Error(`Unknown feature category: ${feature.category}`);
    }
  }

  /**
   * Load core feature modules
   */
  private async loadCoreFeature(featureId: string): Promise<FeatureModule> {
    switch (featureId) {
      case 'auth':
        const { AuthScreen } = await import('../app/auth');
        return {
          id: featureId,
          component: AuthScreen
        };
      case 'dashboard':
        const { DashboardLayout } = await import('../app/dashboard/_layout');
        return {
          id: featureId,
          component: DashboardLayout
        };
      case 'wallet':
        const { DigitalTicketWallet } = await import('../app/components/DigitalTicketWallet');
        return {
          id: featureId,
          component: DigitalTicketWallet
        };
      default:
        throw new Error(`Core feature ${featureId} not implemented`);
    }
  }

  /**
   * Load event-specific feature modules
   */
  private async loadEventFeature(featureId: string): Promise<FeatureModule> {
    const event = getCurrentEvent();
    
    switch (featureId) {
      case 'matchmaking':
        const { default: MatchmakingHome } = await import(`../app/${event.id}/home`);
        return {
          id: featureId,
          component: MatchmakingHome
        };
      case 'speakers':
        const { default: SpeakerProfile } = await import(`../app/${event.id}/speakers/[id]`);
        return {
          id: featureId,
          component: SpeakerProfile
        };
      case 'bookings':
        const { default: BookingList } = await import(`../app/${event.id}/my-bookings`);
        return {
          id: featureId,
          component: BookingList
        };
      case 'admin':
        const { default: AdminPanel } = await import(`../app/${event.id}/admin`);
        return {
          id: featureId,
          component: AdminPanel
        };
      default:
        throw new Error(`Event feature ${featureId} not implemented`);
    }
  }

  /**
   * Load premium feature modules
   */
  private async loadPremiumFeature(featureId: string): Promise<FeatureModule> {
    // Premium features would be loaded from a separate bundle or CDN
    switch (featureId) {
      case 'analytics':
        // This would load from a premium features bundle
        throw new Error(`Premium feature ${featureId} requires premium subscription`);
      case 'notifications':
        // This would load from a premium features bundle
        throw new Error(`Premium feature ${featureId} requires premium subscription`);
      default:
        throw new Error(`Premium feature ${featureId} not implemented`);
    }
  }
}

// Global feature loader instance
export const featureLoader = new FeatureLoader();

/**
 * Hook for loading features in React components
 */
export function useFeature(featureId: string) {
  const [feature, setFeature] = React.useState<FeatureModule | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const loadFeature = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const loadedFeature = await featureLoader.loadFeature(featureId);
        
        if (mounted) {
          setFeature(loadedFeature);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setLoading(false);
        }
      }
    };

    loadFeature();

    return () => {
      mounted = false;
    };
  }, [featureId]);

  return { feature, loading, error };
}

/**
 * Hook for loading multiple features
 */
export function useFeatures(featureIds: string[]) {
  const [features, setFeatures] = React.useState<FeatureModule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const loadFeatures = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const loadedFeatures = await featureLoader.loadFeatures(featureIds);
        
        if (mounted) {
          setFeatures(loadedFeatures);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err as Error);
          setLoading(false);
        }
      }
    };

    loadFeatures();

    return () => {
      mounted = false;
    };
  }, [featureIds.join(',')]);

  return { features, loading, error };
}
