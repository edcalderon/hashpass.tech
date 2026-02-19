import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../../../hooks/useTheme';
import { useAuth } from '../../../../hooks/useAuth';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useToastHelpers } from '../../../../contexts/ToastContext';
import LoadingScreen from '../../../../components/LoadingScreen';

interface BlockedUser {
  id: string;
  blocked_user_id: string;
  blocker_user_id?: string;
  speaker_id?: string;
  blocked_user_email?: string;
  blocked_user_name?: string;
  reason?: string;
  is_muted?: boolean;
  blocked_at: string;
}

export default function BlockedUsersView() {
  const { isDark, colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { showSuccess, showError } = useToastHelpers();
  const styles = getStyles(isDark, colors);

  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (user) {
      loadBlockedUsers();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadBlockedUsers = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('🔄 Loading blocked users for user:', user.id);

      // Get blocked users for the current user (both user-to-user and speaker-to-user blocks)
      // First, check if user is a speaker
      const { data: speakerData, error: speakerError } = await supabase
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (speakerError) {
        console.warn('⚠️ Error checking speaker status:', speakerError);
      }

      const speakerId = speakerData?.id;
      console.log('🔍 Speaker ID:', speakerId);

      // Build query - get blocks where user is the blocker OR user is a speaker blocking someone
      let query = supabase
        .from('user_blocks')
        .select('id, blocked_user_id, blocker_user_id, speaker_id, reason, is_muted, blocked_at')
        .order('blocked_at', { ascending: false });

      if (speakerId) {
        // User is a speaker - get both user-to-user and speaker-to-user blocks
        query = query.or(`blocker_user_id.eq.${user.id},speaker_id.eq.${speakerId}`);
      } else {
        // Regular user - only get user-to-user blocks
        query = query.eq('blocker_user_id', user.id);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error loading blocked users:', error);
        throw error;
      }

      console.log('📋 Raw blocked users data:', data?.length || 0, data);

      if (!data || data.length === 0) {
        setBlockedUsers([]);
        setLoading(false);
        return;
      }

      // Transform data - use basic info for now (can enhance later with user details)
      const transformedData = (data || []).map((block: any) => {
        // Use blocked_user_id to create a display name
        const userId = block.blocked_user_id;
        const shortId = userId.substring(0, 8);
        const email = `user_${shortId}@blocked`;
        const name = `User ${shortId}`;
        
        return {
          ...block,
          blocked_user_email: email,
          blocked_user_name: name,
        };
      });

      console.log('✅ Blocked users loaded:', transformedData.length);
      setBlockedUsers(transformedData);

    } catch (error: any) {
      console.error('❌ Error loading blocked users:', error);
      showError('Error Loading Blocked Users', error.message || 'Failed to load your blocked users list');
      setBlockedUsers([]); // Set empty array on error
    } finally {
      setLoading(false);
      console.log('✅ Loading complete');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadBlockedUsers();
    setRefreshing(false);
  };

  const handleUnblockUser = (blockedUser: BlockedUser) => {
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock ${blockedUser.blocked_user_email}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: () => unblockUser(blockedUser.id),
        },
      ]
    );
  };

  const unblockUser = async (blockId: string) => {
    try {
      console.log('🔄 Unblocking user:', blockId);

      const { error } = await supabase
        .from('user_blocks')
        .delete()
        .eq('id', blockId)
        .or(`blocker_user_id.eq.${user?.id},speaker_id.in.(SELECT id FROM bsl_speakers WHERE user_id.eq.${user?.id})`);

      if (error) {
        console.error('❌ Error unblocking user:', error);
        throw error;
      }

      showSuccess('User Unblocked', 'The user has been unblocked successfully');
      await loadBlockedUsers();

    } catch (error) {
      console.error('❌ Error unblocking user:', error);
      showError('Unblock Failed', 'Failed to unblock user. Please try again.');
    }
  };

  const toggleMute = async (blockedUser: BlockedUser) => {
    try {
      const newMuteStatus = !blockedUser.is_muted;
      console.log(`🔄 ${newMuteStatus ? 'Muting' : 'Unmuting'} user:`, blockedUser.id);

      const { error } = await supabase
        .from('user_blocks')
        .update({ is_muted: newMuteStatus })
        .eq('id', blockedUser.id);

      if (error) {
        console.error('❌ Error toggling mute:', error);
        throw error;
      }

      showSuccess(
        newMuteStatus ? 'User Muted' : 'User Unmuted',
        `The user has been ${newMuteStatus ? 'muted' : 'unmuted'} successfully`
      );
      await loadBlockedUsers();

    } catch (error) {
      console.error('❌ Error toggling mute:', error);
      showError('Mute Failed', 'Failed to toggle mute status. Please try again.');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderBlockedUserCard = (blockedUser: BlockedUser) => (
    <View key={blockedUser.id} style={styles.blockedUserCard}>
      <View style={styles.userInfo}>
        <View style={styles.userAvatar}>
          <MaterialIcons 
            name={blockedUser.is_muted ? "volume-off" : "person"} 
            size={24} 
            color={colors.text.textSecondary} 
          />
        </View>
        <View style={styles.userDetails}>
          <View style={styles.userNameRow}>
            <Text style={styles.userEmail}>
              {blockedUser.blocked_user_name || blockedUser.blocked_user_email || 'Unknown User'}
            </Text>
            {blockedUser.is_muted && (
              <View style={styles.mutedBadge}>
                <MaterialIcons name="volume-off" size={12} color="#FF9800" />
                <Text style={styles.mutedBadgeText}>Muted</Text>
              </View>
            )}
          </View>
          {blockedUser.blocked_user_email && (
            <Text style={styles.userEmailSecondary}>{blockedUser.blocked_user_email}</Text>
          )}
          <Text style={styles.blockDate}>
            Blocked on {formatDate(blockedUser.blocked_at)}
          </Text>
          {blockedUser.reason && (
            <Text style={styles.blockReason}>
              Reason: {blockedUser.reason}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.actionButton, styles.muteButton]}
          onPress={() => toggleMute(blockedUser)}
        >
          <MaterialIcons 
            name={blockedUser.is_muted ? "volume-up" : "volume-off"} 
            size={18} 
            color="#FF9800" 
          />
          <Text style={styles.muteButtonText}>
            {blockedUser.is_muted ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, styles.unblockButton]}
          onPress={() => handleUnblockUser(blockedUser)}
        >
          <MaterialIcons name="lock-open" size={18} color="#4CAF50" />
          <Text style={styles.unblockButtonText}>Unblock</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <LoadingScreen
        icon="block"
        message="Loading blocked users..."
        fullScreen={true}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {blockedUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="block" size={64} color={colors.text.textSecondary} />
            <Text style={styles.emptyTitle}>No Blocked Users</Text>
            <Text style={styles.emptyDescription}>
              You haven't blocked any users yet. Blocked users won't be able to send you meeting requests.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Blocked Users Summary</Text>
              <View style={styles.summaryStats}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{blockedUsers.length}</Text>
                  <Text style={styles.summaryLabel}>Total Blocked</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryValue, { color: '#FF9800' }]}>
                    {blockedUsers.filter(u => u.is_muted).length}
                  </Text>
                  <Text style={styles.summaryLabel}>Muted</Text>
                </View>
              </View>
            </View>

            {blockedUsers.map(renderBlockedUserCard)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? colors.background?.default || '#121212' : colors.background?.default || '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    backgroundColor: isDark ? colors.background?.paper || '#1E1E1E' : colors.background?.paper || '#F5F5F7',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: isDark ? colors.text?.primary || '#FFFFFF' : colors.text?.primary || '#000000',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: isDark ? colors.text?.primary || '#FFFFFF' : colors.text?.primary || '#000000',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: isDark ? colors.text?.secondary || '#B0B0B0' : colors.text?.secondary || '#666666',
    textAlign: 'center',
    lineHeight: 20,
  },
  summaryCard: {
    backgroundColor: isDark ? colors.background?.paper || '#1E1E1E' : colors.background?.paper || '#F5F5F7',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: isDark ? colors.text?.primary || '#FFFFFF' : colors.text?.primary || '#000000',
    marginBottom: 12,
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: isDark ? colors.text?.primary || '#FFFFFF' : colors.text?.primary || '#000000',
  },
  summaryLabel: {
    fontSize: 12,
    color: isDark ? colors.text?.secondary || '#B0B0B0' : colors.text?.secondary || '#666666',
    marginTop: 4,
  },
  blockedUserCard: {
    backgroundColor: isDark ? colors.background?.paper || '#1E1E1E' : colors.background?.paper || '#F5F5F7',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userDetails: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: isDark ? colors.text?.primary || '#FFFFFF' : colors.text?.primary || '#000000',
  },
  userEmailSecondary: {
    fontSize: 12,
    color: isDark ? colors.text?.secondary || '#B0B0B0' : colors.text?.secondary || '#666666',
    marginTop: 2,
  },
  mutedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 152, 0, 0.2)' : 'rgba(255, 152, 0, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  mutedBadgeText: {
    fontSize: 10,
    color: '#FF9800',
    fontWeight: '600',
  },
  blockDate: {
    fontSize: 12,
    color: isDark ? colors.text?.secondary || '#B0B0B0' : colors.text?.secondary || '#666666',
    marginTop: 2,
  },
  blockReason: {
    fontSize: 12,
    color: isDark ? colors.text?.secondary || '#B0B0B0' : colors.text?.secondary || '#666666',
    fontStyle: 'italic',
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  muteButton: {
    borderColor: '#FF9800',
  },
  muteButtonText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  unblockButton: {
    borderColor: '#4CAF50',
  },
  unblockButtonText: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
});
