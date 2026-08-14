import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isMainBranch } from '../lib/event-detector';

const SHOW_ALL_TENANTS_STORAGE_KEY = '@discovery_show_all_tenants';

interface DiscoveryScopeContextType {
  // Whether the explorer/wallet should show every tenant's events and passes
  // instead of just the current whitelabel domain's own event. Always true
  // (and not editable -- see isEditable) on the main hashpass.tech domain,
  // since that domain already is the global, all-tenants view.
  showAllTenants: boolean;
  setShowAllTenants: (enabled: boolean) => Promise<void>;
  isEditable: boolean;
  isReady: boolean;
}

const DiscoveryScopeContext = createContext<DiscoveryScopeContextType | undefined>(undefined);

export const DiscoveryScopeProvider = ({ children }: { children: ReactNode }) => {
  const [showAllTenantsState, setShowAllTenantsState] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (isMainBranch) {
      // Nothing to load or persist -- the main domain has no narrower scope
      // to opt out of.
      setIsReady(true);
      return;
    }

    let active = true;
    const loadPreference = async () => {
      try {
        const savedPreference = await AsyncStorage.getItem(SHOW_ALL_TENANTS_STORAGE_KEY);
        if (active && savedPreference !== null) {
          setShowAllTenantsState(savedPreference === 'true');
        }
      } catch (error) {
        console.error('Failed to load discovery scope preference', error);
      } finally {
        if (active) setIsReady(true);
      }
    };

    loadPreference();
    return () => {
      active = false;
    };
  }, []);

  const setShowAllTenants = async (enabled: boolean) => {
    if (isMainBranch) return;
    try {
      await AsyncStorage.setItem(SHOW_ALL_TENANTS_STORAGE_KEY, enabled.toString());
      setShowAllTenantsState(enabled);
    } catch (error) {
      console.error('Failed to save discovery scope preference', error);
    }
  };

  return (
    <DiscoveryScopeContext.Provider
      value={{
        showAllTenants: isMainBranch ? true : showAllTenantsState,
        setShowAllTenants,
        isEditable: !isMainBranch,
        isReady,
      }}
    >
      {children}
    </DiscoveryScopeContext.Provider>
  );
};

export const useDiscoveryScope = (): DiscoveryScopeContextType => {
  const context = useContext(DiscoveryScopeContext);
  if (context === undefined) {
    throw new Error('useDiscoveryScope must be used within a DiscoveryScopeProvider');
  }
  return context;
};
