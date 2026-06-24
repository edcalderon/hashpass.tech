import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, StyleSheet, StatusBar, Modal, ActivityIndicator } from 'react-native';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { useScroll } from '@contexts/ScrollContext';
// @ts-ignore — Expo SDK 53 type definitions lag behind; named export works at runtime
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../../lib/supabase';
import { useToastHelpers } from '@contexts/ToastContext';
import { authService } from '@hashpass/auth';
import type { AuthUser } from '@hashpass/auth';

// DiceBear PNG format — React Native Image cannot render SVG so we use /png endpoints
const generateAvatarUrl = (name: string, style: 'avataaars' | 'fun-emoji' | 'bottts' = 'avataaars'): string => {
  const seed = encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'));
  if (style === 'avataaars') {
    return `https://api.dicebear.com/7.x/avataaars/png?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
  } else if (style === 'fun-emoji') {
    return `https://api.dicebear.com/7.x/fun-emoji/png?seed=${seed}`;
  } else {
    return `https://api.dicebear.com/7.x/bottts/png?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
  }
};

// Alternative: UI-Avatars service
const generateUIAvatarUrl = (name: string): string => {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=200&bold=true&format=png`;
};

const AVATAR_STYLES = [
  { key: 'google-photo', label: 'Google Photo', icon: 'account-circle' },
  { key: 'avataaars', label: 'Avataaars', icon: 'person' },
  { key: 'fun-emoji', label: 'Fun Emoji', icon: 'emoji-emotions' },
  { key: 'bottts', label: 'Bottts', icon: 'android' },
  { key: 'ui-avatar', label: 'Simple', icon: 'face' },
] as const;

export default function ProfileScreen() {
  const { user, isLoading: authLoading } = useAuth();
  const { isDark, colors } = useTheme();
  const { headerHeight } = useScroll();
  const { showSuccess, showError } = useToastHelpers();
  const styles = getStyles(isDark, colors);

  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string>('avataaars');
  const [profileUser, setProfileUser] = useState<AuthUser | null>(user ?? null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [retryingProfile, setRetryingProfile] = useState(false);
  // Raw Supabase user — always has created_at + user_metadata.avatar_url regardless of auth provider
  const [rawSupabaseUser, setRawSupabaseUser] = useState<any>(null);

  const hasProfileContent = useCallback((candidate?: AuthUser | null): boolean => {
    const hasName = Boolean(
      candidate.first_name?.trim() ||
      candidate.last_name?.trim() ||
      candidate.user_metadata?.full_name?.trim()
    );
    const hasEmail = Boolean(candidate.email?.trim());
    return hasName || hasEmail;
  }, []);

  const wait = useCallback((ms: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  }), []);

  const resolveProfileUser = useCallback(async (manualRetry = false) => {
    if (manualRetry) setRetryingProfile(true);
    setProfileLoading(true);
    setProfileError(null);

    const initialCandidate = user ?? authService.getUser?.() ?? null;
    if (hasProfileContent(initialCandidate)) {
      setProfileUser(initialCandidate);
      setProfileLoading(false);
      setRetryingProfile(false);
      return;
    }

    try {
      const retryDelaysMs = [350, 800];
      let latestCandidate: AuthUser | null = initialCandidate;

      for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
        const session = await authService.getSession();
        latestCandidate = (session?.user as AuthUser | null) ?? authService.getUser?.() ?? latestCandidate;

        if (hasProfileContent(latestCandidate)) {
          setProfileUser(latestCandidate);
          setProfileError(null);
          setProfileLoading(false);
          setRetryingProfile(false);
          return;
        }

        if (attempt < retryDelaysMs.length) {
          await wait(retryDelaysMs[attempt]);
        }
      }

      setProfileUser(latestCandidate);
      setProfileError('Could not retrieve complete profile details. Please try again in a moment.');
    } catch (error) {
      console.error('Profile resolution error:', error);
      setProfileError('Could not retrieve complete profile details. Please try again in a moment.');
    } finally {
      setProfileLoading(false);
      setRetryingProfile(false);
    }
  }, [hasProfileContent, user, wait]);

  useEffect(() => {
    if (authLoading) return;
    resolveProfileUser(false);
  }, [authLoading, resolveProfileUser]);

  // Always fetch raw Supabase session — it has created_at and user_metadata.avatar_url
  // regardless of which auth provider (Directus/Supabase) is active.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) setRawSupabaseUser(data.session.user);
    });
  }, []);

  const activeUser = profileUser ?? user ?? null;

  // Calculate padding needed to account for navbar
  const statusBarHeight = StatusBar.currentHeight || 0;
  const effectiveHeaderHeight = headerHeight || 60;
  const totalHeaderHeight = statusBarHeight + effectiveHeaderHeight;

  // Get current avatar URL or generate one
  const getDisplayName = (): string => {
    const metadataName = activeUser?.user_metadata?.full_name;
    const directusName = [activeUser?.first_name, activeUser?.last_name].filter(Boolean).join(' ').trim();
    return metadataName || directusName || activeUser?.email?.split('@')[0] || '';
  };

  const getCurrentAvatarUrl = (): string => {
    // Priority 1: Supabase user_metadata (Google OAuth sets avatar_url / picture here)
    // Raw Supabase session is the most reliable source across all auth paths
    const supabaseMeta = rawSupabaseUser?.user_metadata;
    const supabasePhoto = supabaseMeta?.avatar_url || supabaseMeta?.picture;
    if (supabasePhoto) return supabasePhoto;

    // Priority 2: activeUser user_metadata (populated for native Supabase path after mapSupabaseUserToAuthUser fix)
    const metaPhoto = activeUser?.user_metadata?.avatar_url || activeUser?.user_metadata?.picture;
    if (metaPhoto) return metaPhoto;

    // Priority 3: Directus avatar — only trust full URLs (UUID-only assets require auth and a live Directus server)
    if (typeof activeUser?.avatar === 'string' && /^https?:\/\//.test(activeUser.avatar)) {
      return activeUser.avatar;
    }

    // Fallback: initials via UI-Avatars
    const name = getDisplayName() || 'hashpass-user';
    return generateUIAvatarUrl(name);
  };

  const handleAvatarPress = () => {
    setShowAvatarModal(true);
  };

  const handleAvatarSelect = async (style: string) => {
    if (!activeUser) return;

    setUpdatingAvatar(true);
    try {
      const name = getDisplayName() || 'hashpass-user';
      let avatarUrl: string;

      if (style === 'google-photo') {
        const googlePhoto = activeUser?.user_metadata?.avatar_url || activeUser?.user_metadata?.picture;
        if (!googlePhoto) {
          showError('No Google Photo', 'No Google profile photo found for your account');
          return;
        }
        avatarUrl = googlePhoto;
      } else if (style === 'ui-avatar') {
        avatarUrl = generateUIAvatarUrl(name);
      } else {
        avatarUrl = generateAvatarUrl(name, style as 'avataaars' | 'fun-emoji' | 'bottts');
      }

      // Update Supabase auth metadata (works for all Supabase-authenticated users including Google)
      const { error: metaError } = await supabase.auth.updateUser({
        data: { ...activeUser.user_metadata, avatar_url: avatarUrl },
      });
      if (metaError) throw metaError;

      // Also persist to user_profiles table so other parts of the app read it consistently
      const { error: dbError } = await (supabase as any)
        .from('user_profiles')
        .upsert({ user_id: activeUser.id, avatar_url: avatarUrl }, { onConflict: 'user_id' });
      if (dbError) console.warn('[profile] user_profiles upsert:', dbError.message);

      // Refresh session so user_metadata reflects the change immediately
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        setProfileUser((prev: AuthUser | null) => prev ? {
          ...prev,
          user_metadata: { ...prev.user_metadata, avatar_url: avatarUrl },
        } : prev);
      }

      showSuccess('Avatar Updated', 'Your profile picture has been updated successfully');
      setShowAvatarModal(false);
    } catch (error: any) {
      console.error('Error updating avatar:', error);
      showError('Update Failed', error.message || 'Failed to update avatar');
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const userName = getDisplayName();
  const userEmail = activeUser?.email?.trim() || '';
  const userNameDisplay = userName || 'Not available';
  const userEmailDisplay = userEmail || 'Not available';
  
  // Member since — try multiple sources in priority order:
  // rawSupabaseUser.created_at is always set by Supabase regardless of auth provider
  const getMemberSince = () => {
    const createdAt =
      rawSupabaseUser?.created_at ||
      activeUser?.created_at ||
      activeUser?.date_created;
    if (createdAt) {
      try {
        const date = new Date(createdAt);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
        }
      } catch (e) {
        console.warn('Error parsing created_at:', e);
      }
    }
    return null;
  };
  
  const memberSince = getMemberSince();

  if (authLoading || profileLoading) {
    return (
      <View style={styles.container}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.header, { paddingTop: totalHeaderHeight + 20 }]}>
            <View style={[styles.avatar, styles.skeletonBlock]} />
            <View style={[styles.skeletonLine, styles.skeletonTitle]} />
            <View style={[styles.skeletonLine, styles.skeletonSubtitle]} />
          </View>
          <View style={styles.content}>
            <View style={styles.section}>
              <View style={[styles.skeletonLine, styles.skeletonSectionTitle]} />
              <View style={styles.infoCard}>
                <View style={[styles.skeletonLine, styles.skeletonRow]} />
                <View style={[styles.skeletonLine, styles.skeletonRow]} />
                <View style={[styles.skeletonLine, styles.skeletonRow]} />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

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
              onError={() => {
                // Silently handled — avatar falls back to initials placeholder via container bg
              }}
            />
            <View style={styles.avatarEditBadge}>
              <MaterialIcons name="camera-alt" size={20} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <Text style={styles.userName}>{userNameDisplay}</Text>
          <Text style={styles.userEmail}>{userEmailDisplay}</Text>
          
          {memberSince ? (
            <View style={styles.memberBadge}>
              <Ionicons name="calendar-outline" size={14} color={colors.primary} />
              <Text style={styles.memberText}>Member since {memberSince}</Text>
            </View>
          ) : null}
        </View>

        {/* Profile Content */}
        <View style={styles.content}>
          {profileError ? (
            <View style={styles.profileErrorCard}>
              <View style={styles.profileErrorHeader}>
                <Ionicons name="warning-outline" size={18} color="#B91C1C" />
                <Text style={styles.profileErrorTitle}>Profile data incomplete</Text>
              </View>
              <Text style={styles.profileErrorText}>{profileError}</Text>
              <TouchableOpacity
                style={styles.profileErrorRetryButton}
                onPress={() => resolveProfileUser(true)}
                disabled={retryingProfile}
                activeOpacity={0.8}
              >
                {retryingProfile ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.profileErrorRetryLabel}>Retry</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

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
                  <Text style={styles.infoValue}>{userEmailDisplay}</Text>
                </View>
              </View>
              
              <View style={styles.divider} />
              
              <View style={styles.infoRow}>
                <View style={styles.infoIconContainer}>
                  <Ionicons name="person-outline" size={22} color={colors.primary} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Full Name</Text>
                  <Text style={styles.infoValue}>{userNameDisplay}</Text>
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
                    {memberSince || (activeUser?.created_at ? 'Recently' : 'Not available')}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            
            <TouchableOpacity 
              style={[styles.actionButton, !activeUser && styles.actionButtonDisabled]}
              onPress={handleAvatarPress}
              disabled={!activeUser}
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
              {AVATAR_STYLES.filter((style) => {
                if (style.key === 'google-photo') {
                  return !!(activeUser?.user_metadata?.avatar_url || activeUser?.user_metadata?.picture);
                }
                return true;
              }).map((style) => {
                let previewUrl: string;
                if (style.key === 'google-photo') {
                  previewUrl = activeUser?.user_metadata?.avatar_url || activeUser?.user_metadata?.picture || '';
                } else if (style.key === 'ui-avatar') {
                  previewUrl = generateUIAvatarUrl(userNameDisplay);
                } else {
                  previewUrl = generateAvatarUrl(userNameDisplay, style.key as 'avataaars' | 'fun-emoji' | 'bottts');
                }

                const isSelected = selectedStyle === style.key;

                return (
                  <TouchableOpacity
                    key={style.key}
                    style={[
                      styles.avatarOption,
                      isSelected && styles.avatarOptionSelected,
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
                      {isSelected && (
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
  profileErrorCard: {
    backgroundColor: isDark ? '#301111' : '#FEF2F2',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: isDark ? '#7F1D1D' : '#FCA5A5',
  },
  profileErrorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  profileErrorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: isDark ? '#FCA5A5' : '#991B1B',
  },
  profileErrorText: {
    fontSize: 13,
    lineHeight: 18,
    color: isDark ? '#FECACA' : '#7F1D1D',
    marginBottom: 10,
  },
  profileErrorRetryButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#DC2626',
    borderRadius: 8,
    minWidth: 76,
    minHeight: 34,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileErrorRetryLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
  actionButtonDisabled: {
    opacity: 0.55,
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
  skeletonBlock: {
    backgroundColor: isDark ? '#262626' : '#E5E7EB',
    borderColor: 'transparent',
  },
  skeletonLine: {
    borderRadius: 8,
    backgroundColor: isDark ? '#262626' : '#E5E7EB',
  },
  skeletonTitle: {
    width: 160,
    height: 24,
    marginTop: 16,
  },
  skeletonSubtitle: {
    width: 220,
    height: 16,
    marginTop: 10,
  },
  skeletonSectionTitle: {
    width: 180,
    height: 22,
    marginBottom: 12,
    marginLeft: 4,
  },
  skeletonRow: {
    width: '100%',
    height: 20,
    marginVertical: 10,
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
