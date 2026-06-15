import React, { createContext, useContext, ReactNode, useCallback, useState } from 'react';
import { lukasRewardService } from '../lib/lukas-reward-service';
import { useAuth } from '../hooks/useAuth';

interface BalanceContextType {
  refreshBalance: () => Promise<void>;
  isRefreshing: boolean;
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

interface BalanceProviderProps {
  children: ReactNode;
}

export function BalanceProvider({ children }: BalanceProviderProps) {
  const { user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!user?.id) return;
    
    setIsRefreshing(true);
    try {
      // Force refresh the balance - this will trigger the subscription callback
      const balance = await lukasRewardService.getUserBalance(user.id, 'LUKAS');
      console.log('💰 Balance refresh triggered, new balance:', balance);
      
      // Dispatch custom event to trigger UI refresh in BlockchainTokensView
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('balance:refresh'));
      }
    } catch (error) {
      console.error('❌ Error refreshing balance:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [user?.id]);

  const value: BalanceContextType = {
    refreshBalance,
    isRefreshing,
  };

  return (
    <BalanceContext.Provider value={value}>
      {children}
    </BalanceContext.Provider>
  );
}

export function useBalance(): BalanceContextType {
  const context = useContext(BalanceContext);
  if (context === undefined) {
    throw new Error('useBalance must be used within a BalanceProvider');
  }
  return context;
}

