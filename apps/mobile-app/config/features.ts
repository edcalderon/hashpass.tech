/**
 * Feature definitions for the HASHPASS white-label platform
 * Defines available features and their configurations
 */

export interface FeatureConfig {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'event' | 'premium';
  dependencies?: string[];
  apiEndpoints?: string[];
  routes?: string[];
  components?: string[];
  enabled: boolean;
}

export const FEATURES: Record<string, FeatureConfig> = {
  // Core Features (always available)
  'auth': {
    id: 'auth',
    name: 'Authentication',
    description: 'User authentication and session management',
    category: 'core',
    apiEndpoints: ['/api/auth'],
    routes: ['/auth', '/auth/callback'],
    components: ['AuthScreen', 'AuthCallback'],
    enabled: true
  },
  'dashboard': {
    id: 'dashboard',
    name: 'User Dashboard',
    description: 'Main user interface and navigation',
    category: 'core',
    dependencies: ['auth'],
    routes: ['/dashboard'],
    components: ['DashboardLayout', 'ExploreScreen', 'ProfileScreen', 'WalletScreen'],
    enabled: true
  },
  'wallet': {
    id: 'wallet',
    name: 'Digital Wallet',
    description: 'Digital ticket and credential management',
    category: 'core',
    dependencies: ['auth'],
    routes: ['/dashboard/wallet'],
    components: ['DigitalTicketWallet', 'ExchangeView'],
    enabled: true
  },

  // Event Features
  'matchmaking': {
    id: 'matchmaking',
    name: 'Speaker Matchmaking',
    description: 'Connect attendees with speakers for meetings',
    category: 'event',
    dependencies: ['auth'],
    apiEndpoints: ['/api/bsl/speakers', '/api/bsl/bookings', '/api/bsl/auto-match'],
    routes: ['/bsl/home', '/bsl/speakers', '/bsl/my-bookings'],
    components: ['MatchmakingHome', 'SpeakerProfile', 'BookingCalendar'],
    enabled: true
  },
  'speakers': {
    id: 'speakers',
    name: 'Speaker Management',
    description: 'Speaker profiles and availability management',
    category: 'event',
    dependencies: ['auth'],
    apiEndpoints: ['/api/bsl/speakers'],
    routes: ['/bsl/speakers', '/bsl/speaker-dashboard'],
    components: ['SpeakerList', 'SpeakerProfile', 'SpeakerDashboard'],
    enabled: true
  },
  'bookings': {
    id: 'bookings',
    name: 'Booking System',
    description: 'Meeting booking and scheduling system',
    category: 'event',
    dependencies: ['auth', 'speakers'],
    apiEndpoints: ['/api/bsl/bookings'],
    routes: ['/bsl/my-bookings', '/bsl/speakers/calendar'],
    components: ['BookingList', 'BookingCalendar', 'BookingForm'],
    enabled: true
  },
  'admin': {
    id: 'admin',
    name: 'Admin Panel',
    description: 'Event administration and management',
    category: 'event',
    dependencies: ['auth'],
    apiEndpoints: ['/api/bsl/admin'],
    routes: ['/bsl/admin'],
    components: ['AdminPanel', 'EventAnalytics'],
    enabled: true
  },

  // Premium Features
  'analytics': {
    id: 'analytics',
    name: 'Event Analytics',
    description: 'Advanced analytics and reporting',
    category: 'premium',
    dependencies: ['auth', 'admin'],
    apiEndpoints: ['/api/bsl/analytics'],
    components: ['AnalyticsDashboard', 'EventMetrics'],
    enabled: false
  },
  'notifications': {
    id: 'notifications',
    name: 'Push Notifications',
    description: 'Real-time notifications and alerts',
    category: 'premium',
    dependencies: ['auth'],
    apiEndpoints: ['/api/bsl/notifications'],
    components: ['NotificationCenter', 'NotificationSettings'],
    enabled: false
  }
};

/**
 * Get features for a specific event
 */
export function getEventFeatures(eventId: string): FeatureConfig[] {
  return Object.values(FEATURES).filter(feature => {
    // Core features are always included
    if (feature.category === 'core') return true;
    
    // Event features are included based on event configuration
    // This would be determined by the event config
    return feature.enabled;
  });
}

/**
 * Check if a feature is available for the current event
 */
export function isFeatureEnabled(featureId: string, eventId?: string): boolean {
  const feature = FEATURES[featureId];
  if (!feature) return false;
  
  // Core features are always enabled
  if (feature.category === 'core') return feature.enabled;
  
  // Event and premium features depend on event configuration
  return feature.enabled;
}

/**
 * Get feature dependencies
 */
export function getFeatureDependencies(featureId: string): string[] {
  const feature = FEATURES[featureId];
  return feature?.dependencies || [];
}

/**
 * Get all enabled features for an event
 */
export function getEnabledFeatures(eventId: string): string[] {
  return Object.values(FEATURES)
    .filter(feature => isFeatureEnabled(feature.id, eventId))
    .map(feature => feature.id);
}
