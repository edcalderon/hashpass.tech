import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, StatusBar, Modal, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { useScroll } from '../../../contexts/ScrollContext';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from '../../../i18n/i18n';
import { supabase } from '../../../lib/supabase';
import { useToastHelpers } from '../../../contexts/ToastContext';

// Generate avatar URL using UI-Avatars service (similar to landing page)
const generateAvatarUrl = (name: string, style: 'avataaars' | 'fun-emoji' | 'bottts' = 'avataaars'): string => {
  const seed = name.toLowerCase().replace(/\s+/g, '-');
  if (style === 'avataaars') {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  } else if (style === 'fun-emoji') {
    return `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${encodeURIComponent(seed)}`;
  } else {
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  }
};

// Alternative: UI-Avatars service
const generateUIAvatarUrl = (name: string): string => {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=200&bold=true&format=png`;
};

const AVATAR_STYLES = [
  { key: 'avataaars', label: 'Avataaars', icon: 'person' },
  { key: 'fun-emoji', label: 'Fun Emoji', icon: 'emoji-emotions' },
  { key: 'bottts', label: 'Bottts', icon: 'android' },
  { key: 'ui-avatar', label: 'Simple', icon: 'face' },
] as const;

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { isDark, colors } = useTheme();
  const { t } = useTranslation('profile');
  const { headerHeight } = useScroll();
  const { showSuccess, showError } = useToastHelpers();
  const styles = getStyles(isDark, colors);

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('avataaars');

  // Calculate padding needed to account for navbar
  const statusBarHeight = StatusBar.currentHeight || 0;
  const effectiveHeaderHeight = headerHeight || 60;
  const totalHeaderHeight = statusBarHeight + effectiveHeaderHeight;

  // Get current avatar URL or generate one
  const getCurrentAvatarUrl = (): string => {
    if (user?.user_metadata?.avatar_url) {
      return user.user_metadata.avatar_url;
    }
    const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
    return generateAvatarUrl(name, 'avataaars');
  };

  const handleAvatarPress = () => {
    setShowAvatarModal(true);
  };

  const handleAvatarSelect = async (style: string) => {
    if (!user) return;

    setUpdatingAvatar(true);
    try {
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
      let avatarUrl: string;

      if (style === 'ui-avatar') {
        avatarUrl = generateUIAvatarUrl(name);
      } else {
        avatarUrl = generateAvatarUrl(name, style as 'avataaars' | 'fun-emoji' | 'bottts');
      }

      // Update user metadata in Supabase
      const { error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          avatar_url: avatarUrl,
        },
      });

      if (error) {
        throw error;
      }

      // Refresh the session to get updated user data
      await supabase.auth.getSession();

      showSuccess('Avatar Updated', 'Your profile picture has been updated successfully');
      setShowAvatarModal(false);
    } catch (error: any) {
      console.error('Error updating avatar:', error);
      showError('Update Failed', error.message || 'Failed to update avatar');
    } finally {
      setUpdatingAvatar(false);
    }
  };

  // Get user name - prefer full_name, then email username, then email, never show generic "User"
  const userName = user?.user_metadata?.full_name || 
                   (user?.email ? user.email.split('@')[0] : null) || 
                   user?.email || 
                   '';
  
  const userEmail = user?.email || '';
  
  // Get member since date - use created_at from user
  // Supabase user object should always have created_at, but we handle gracefully if missing
  const getMemberSince = () => {
    const createdAt = user?.created_at;
    if (createdAt) {
      try {
        const date = new Date(createdAt);
        // Check if date is valid
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long' 
          });
        }
      } catch (e) {
        console.warn('Error parsing created_at:', e);
      }
    }
    // Return null instead of 'Unknown' - we'll conditionally render or show fallback
    return null;
  };
  
  const memberSince = getMemberSince();

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <View style={[styles.header, { paddingTop: totalHeaderHeight + 20 }]}>
          <TouchableOpacity 
            style={styles.avatarContainer}
            onPress={handleAvatarPress}
            activeOpacity={0.8}
          >
            <Image
              source={{ uri: getCurrentAvatarUrl() }}
              style={styles.avatar}
            />
            <View style={styles.avatarEditBadge}>
              <MaterialIcons name="camera-alt" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {userName ? (
            <Text style={styles.userName}>{userName}</Text>
          ) : null}
          {userEmail ? (
            <Text style={styles.userEmail}>{userEmail}</Text>
          ) : null}
          
          {memberSince ? (
            <View style={styles.memberBadge}>
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              <Text style={styles.memberText}>Member since {memberSince}</Text>
            </View>
          ) : null}
        </View>

        {/* Profile Content */}
        <View style={styles.content}>
          {/* Account Information Card */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account Information</Text>
            
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="mail-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Email Address</Text>
                  <Text style={styles.infoValue}>{userEmail}</Text>
                </View>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="person-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Full Name</Text>
                  <Text style={styles.infoValue}>
                    {user?.user_metadata?.full_name || (user?.email ? user.email.split('@')[0] : '') || 'Not provided'}
                  </Text>
                </View>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="calendar-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Member Since</Text>
                  <Text style={styles.infoValue}>
                    {memberSince || (user?.created_at ? 'Recently' : 'Not available')}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleAvatarPress}
              activeOpacity={0.7}
            >
              <View style={styles.actionIconContainer}>
                <MaterialIcons name="photo-camera" size={24} color={colors.primary} />
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Change Avatar</Text>
                <Text style={styles.actionSubtitle}>Update your profile picture</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.text?.secondary || '#999'} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Avatar Selection Modal */}
      <Modal
        visible={showAvatarModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose Avatar Style</Text>
              <TouchableOpacity
                onPress={() => setShowAvatarModal(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.text?.primary || '#000'} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.avatarGrid} showsVerticalScrollIndicator={false}>
              {AVATAR_STYLES.map((style) => {
                const previewUrl = style.key === 'ui-avatar' 
                  ? generateUIAvatarUrl(userName)
                  : generateAvatarUrl(userName, style.key as 'avataaars' | 'fun-emoji' | 'bottts');
                
                const isSelected = selectedStyle === style.key;
                const isCurrent = user?.user_metadata?.avatar_url?.includes(style.key) || 
                                 (!user?.user_metadata?.avatar_url && style.key === 'avataaars');

                return (
                  <TouchableOpacity
                    key={style.key}
                    style={[
                      styles.avatarOption,
                      isSelected && styles.avatarOptionSelected,
                      isCurrent && styles.avatarOptionCurrent,
                    ]}
                    onPress={() => {
                      setSelectedStyle(style.key);
                      handleAvatarSelect(style.key);
                    }}
                    disabled={updatingAvatar}
                  >
                    <View style={styles.avatarPreviewContainer}>
                      <Image
                        source={{ uri: previewUrl }}
                        style={styles.avatarPreview}
                      />
                      {isCurrent && (
                        <View style={styles.currentBadge}>
                          <MaterialIcons name="check-circle" size={20} color={colors.primary} />
                        </View>
                      )}
                    </View>
                    <Text style={styles.avatarOptionLabel}>{style.label}</Text>
                    {updatingAvatar && selectedStyle === style.key && (
                      <ActivityIndicator size="small" color={colors.primary} style={styles.loadingIndicator} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Text style={styles.modalFooterText}>
                Select an avatar style to update your profile picture
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? colors.background?.default || '#000000' : colors.background?.paper || '#F5F5F5',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: isDark ? colors.background?.default || '#000000' : colors.background?.paper || '#FFFFFF',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: isDark ? '#1a1a1a' : '#E0E0E0',
    borderWidth: 4,
    borderColor: colors.primary || '#6366f1',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary || '#6366f1',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: isDark ? colors.background?.default || '#000' : colors.background?.paper || '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  userName: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 4,
    textAlign: 'center',
  },
  userEmail: {
    fontSize: 16,
    color: colors.text?.secondary || (isDark ? '#CCCCCC' : '#666666'),
    marginBottom: 12,
    textAlign: 'center',
  },
  memberBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  memberText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.primary || '#6366f1',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 12,
    marginLeft: 4,
  },
  infoCard: {
    backgroundColor: isDark ? colors.card?.default || '#1a1a1a' : colors.card?.default || '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? '#333333' : 'transparent',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text?.secondary || (isDark ? '#CCCCCC' : '#666666'),
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
  },
  divider: {
    height: 1,
    backgroundColor: isDark ? '#333333' : '#E0E0E0',
    marginVertical: 16,
    marginLeft: 60,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.card?.default || '#1a1a1a' : colors.card?.default || '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? '#333333' : 'transparent',
  },
  actionIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(99, 102, 241, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 13,
    color: colors.text?.secondary || (isDark ? '#CCCCCC' : '#666666'),
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: isDark ? colors.background?.default || '#1a1a1a' : colors.background?.paper || '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#333333' : '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
  },
  modalCloseButton: {
    padding: 4,
  },
  avatarGrid: {
    padding: 20,
  },
  avatarOption: {
    alignItems: 'center',
    padding: 16,
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: isDark ? '#1a1a1a' : '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  avatarOptionSelected: {
    borderColor: colors.primary || '#6366f1',
    backgroundColor: isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)',
  },
  avatarOptionCurrent: {
    borderColor: colors.primary || '#6366f1',
  },
  avatarPreviewContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarPreview: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: isDark ? '#2a2a2a' : '#E0E0E0',
  },
  currentBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: isDark ? colors.background?.default || '#000' : colors.background?.paper || '#FFF',
    borderRadius: 12,
  },
  avatarOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
  },
  loadingIndicator: {
    marginTop: 8,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalFooterText: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#CCCCCC' : '#666666'),
    textAlign: 'center',
  },
});
