/**
 * LUKAS Reward Service
 * Handles fetching and managing LUKAS token balances and transactions
 */

import { supabase } from './supabase';

export interface UserBalance {
  id: string;
  user_id: string;
  token_symbol: string;
  balance: number;
  updated_at: string;
}

export interface RewardTransaction {
  id: string;
  user_id: string;
  token_symbol: string;
  transaction_type: 'reward' | 'transfer' | 'swap' | 'redemption';
  amount: number;
  balance_before: number;
  balance_after: number;
  source: 'meeting_accepted' | 'event_attendance' | 'referral' | 'admin_grant' | 'other';
  reference_id?: string;
  reference_type?: string;
  description?: string;
  created_at: string;
}

class LukasRewardService {
  /**
   * Get user's LUKAS balance
   */
  async getUserBalance(userId: string, tokenSymbol: string = 'LUKAS'): Promise<number> {
    try {
      console.log('💰 getUserBalance called for user:', userId, 'token:', tokenSymbol);
      
      // First try direct query (faster)
      const { data: directData, error: directError } = await supabase
        .from('user_balances')
        .select('balance')
        .eq('user_id', userId)
        .eq('token_symbol', tokenSymbol)
        .single();

      if (!directError && directData) {
        const balance = parseFloat(directData.balance.toString());
        console.log('💰 Direct query balance:', balance);
        return balance;
      }

      // Fallback to RPC function if direct query fails
      console.log('💰 Direct query failed, trying RPC function');
      const { data, error } = await supabase.rpc('get_user_balance', {
        p_user_id: userId,
        p_token_symbol: tokenSymbol,
      });

      if (error) {
        console.error('❌ Error fetching user balance via RPC:', error);
        return 0;
      }

      const balance = parseFloat(data || '0');
      console.log('💰 RPC function balance:', balance);
      return balance;
    } catch (error) {
      console.error('❌ Error in getUserBalance:', error);
      return 0;
    }
  }

  /**
   * Get user's balance from user_balances table (direct query)
   */
  async getUserBalanceDirect(userId: string, tokenSymbol: string = 'LUKAS'): Promise<UserBalance | null> {
    try {
      const { data, error } = await supabase
        .from('user_balances')
        .select('*')
        .eq('user_id', userId)
        .eq('token_symbol', tokenSymbol)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No balance found, return null (will be created on first reward)
          return null;
        }
        console.error('Error fetching user balance:', error);
        return null;
      }

      return data as UserBalance;
    } catch (error) {
      console.error('Error in getUserBalanceDirect:', error);
      return null;
    }
  }

  /**
   * Get user's transaction history
   */
  async getUserTransactions(
    userId: string,
    tokenSymbol: string | null = null,
    limit: number = 50,
    offset: number = 0
  ): Promise<RewardTransaction[]> {
    try {
      const { data, error } = await supabase.rpc('get_user_transactions', {
        p_user_id: userId,
        p_token_symbol: tokenSymbol,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('Error fetching user transactions:', error);
        return [];
      }

      return (data || []) as RewardTransaction[];
    } catch (error) {
      console.error('Error in getUserTransactions:', error);
      return [];
    }
  }

  /**
   * Subscribe to balance changes for a user
   * Listens for INSERT, UPDATE, and DELETE events on user_balances table
   */
  subscribeToBalance(
    userId: string,
    tokenSymbol: string,
    callback: (balance: UserBalance | null) => void
  ) {
    const channel = supabase
      .channel(`user_balance_${userId}_${tokenSymbol}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'user_balances',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          console.log('💰 Balance change detected:', payload.eventType, payload.new, payload.old);
          
          // Longer delay to ensure database transaction is fully committed
          // This is especially important for triggers that run in the same transaction
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Always refetch balance for INSERT/UPDATE events to get the latest value
          // This ensures we get the balance even if the payload doesn't have all the data
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            try {
              const balance = await this.getUserBalanceDirect(userId, tokenSymbol);
              if (balance && balance.token_symbol === tokenSymbol) {
                console.log('💰 Refetched balance after', payload.eventType, ':', balance.balance);
                callback(balance);
                return;
              }
            } catch (error) {
              console.error('❌ Error refetching balance:', error);
            }
          }
          
          // Fallback: Handle based on payload data
          if (payload.new && (payload.new as any).token_symbol === tokenSymbol) {
            // Refetch balance when it changes (INSERT or UPDATE)
            const balance = await this.getUserBalanceDirect(userId, tokenSymbol);
            console.log('💰 Updated balance from payload:', balance);
            if (balance) {
              callback(balance);
            }
          } else if (payload.old && (payload.old as any).token_symbol === tokenSymbol && !payload.new) {
            // Balance was deleted (DELETE event)
            console.log('💰 Balance deleted');
            callback(null);
          }
        }
      )
      .subscribe((status) => {
        console.log('💰 Balance subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Balance subscription active for user:', userId);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Balance subscription error for user:', userId);
        }
      });

    return () => {
      console.log('🧹 Unsubscribing from balance changes for user:', userId);
      supabase.removeChannel(channel);
    };
  }
}

export const lukasRewardService = new LukasRewardService();

