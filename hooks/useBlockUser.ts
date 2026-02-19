import { useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useToastHelpers } from '../contexts/ToastContext';

export interface BlockUserOptions {
  userId: string;
  reason?: string;
  mute?: boolean;
}

export function useBlockUser() {
  const { user } = useAuth();
  const { showSuccess, showError } = useToastHelpers();
  const [loading, setLoading] = useState(false);

  const blockUser = async (options: BlockUserOptions): Promise<boolean> => {
    if (!user) {
      showError('Error', 'You must be logged in to block users');
      return false;
    }

    try {
      setLoading(true);
      const { userId, reason, mute = false } = options;

      // Check if user is already blocked
      const { data: existingBlock } = await supabase
        .from('user_blocks')
        .select('id, is_muted')
        .eq('blocker_user_id', user.id)
        .eq('blocked_user_id', userId)
        .single();

      if (existingBlock) {
        // Update existing block (e.g., change mute status or reason)
        const { error: updateError } = await supabase
          .from('user_blocks')
          .update({
            reason: reason || existingBlock.reason,
            is_muted: mute,
            blocked_at: new Date().toISOString(),
          })
          .eq('id', existingBlock.id);

        if (updateError) throw updateError;

        showSuccess('Block Updated', 'User block has been updated');
        return true;
      }

      // Create new block
      const { error: insertError } = await supabase
        .from('user_blocks')
        .insert({
          blocker_user_id: user.id,
          blocked_user_id: userId,
          reason: reason || null,
          is_muted: mute,
          blocked_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;

      showSuccess('User Blocked', 'The user has been blocked successfully');
      return true;

    } catch (error: any) {
      console.error('❌ Error blocking user:', error);
      showError('Block Failed', error.message || 'Failed to block user. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (blockedUserId: string): Promise<boolean> => {
    if (!user) {
      showError('Error', 'You must be logged in to unblock users');
      return false;
    }

    try {
      setLoading(true);

      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('blocker_user_id', user.id)
        .eq('blocked_user_id', blockedUserId);

      if (error) throw error;

      showSuccess('User Unblocked', 'The user has been unblocked successfully');
      return true;

    } catch (error: any) {
      console.error('❌ Error unblocking user:', error);
      showError('Unblock Failed', error.message || 'Failed to unblock user. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const isUserBlocked = async (userId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { data } = await supabase
        .from('user_blocks')
        .select('id')
        .eq('blocker_user_id', user.id)
        .eq('blocked_user_id', userId)
        .single();

      return !!data;
    } catch (error) {
      return false;
    }
  };

  const showBlockUserDialog = (
    userName: string,
    userId: string,
    onBlock?: () => void
  ) => {
    Alert.alert(
      'Block User',
      `Are you sure you want to block ${userName}? They won't be able to send you meeting requests.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Block',
          style: 'destructive',
          onPress: async () => {
            const success = await blockUser({ userId });
            if (success && onBlock) {
              onBlock();
            }
          },
        },
      ]
    );
  };

  return {
    blockUser,
    unblockUser,
    isUserBlocked,
    showBlockUserDialog,
    loading,
  };
}

