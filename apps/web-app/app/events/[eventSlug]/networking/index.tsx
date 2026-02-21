import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Animated,
  InteractionManager,
} from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useToastHelpers } from '@/contexts/ToastContext';
import QuickAccessGrid from '@/components/explorer/QuickAccessGrid';
import LoadingScreen from '@/components/LoadingScreen';
import { NetworkingStats, StatsState, QuickAccessItem } from '@/types/networking';
import { CopilotStep, walkthroughable, useCopilot } from 'react-native-copilot';
import { useTutorialPreferences } from '@/hooks/useTutorialPreferences';
import { useTranslation } from '@/i18n/i18n';

const CopilotView = walkthroughable(View);
const CopilotTouchableOpacity = walkthroughable(TouchableOpacity);

export default function NetworkingView() {
  const { isDark, colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { showSuccess, showError } = useToastHelpers();
  const { t } = useTranslation();
  const { start: startNetworkingTutorial, copilotEvents, handleNth } = useCopilot();
  const { shouldShowTutorial, markTutorialCompleted, isReady, networkingTutorialCompleted, updateTutorialStep } = useTutorialPreferences();
  const { isLoggedIn, isLoading: authLoading } = useAuth();
  const tutorialStartedRef = useRef(false);
  const styles = getStyles(isDark, colors);

  // Reset ref when tutorial is reset (completion status changes from true to false)
  useEffect(() => {
    if (!networkingTutorialCompleted) {
      tutorialStartedRef.current = false;
    }
  }, [networkingTutorialCompleted]);

  // Auto-start tutorial for new users - only once, when everything is ready
  useEffect(() => {
    // Prevent multiple starts
    if (tutorialStartedRef.current) return;
    
    // Wait for all conditions to be met
    if (!isReady || !isLoggedIn || authLoading || !shouldShowTutorial('networking')) {
      return;
    }

    // Use InteractionManager to ensure UI is ready
    const interaction = InteractionManager.runAfterInteractions(() => {
      // Additional delay to ensure all CopilotSteps are registered
      const timer = setTimeout(() => {
        if (!tutorialStartedRef.current) {
          tutorialStartedRef.current = true;
          try {
            // Start networking tutorial at order 100 (first networking step)
            if (handleNth && typeof handleNth === 'function') {
              handleNth(100);
            } else {
              startNetworkingTutorial();
            }
          } catch (error) {
            console.error('Error starting networking tutorial:', error);
            tutorialStartedRef.current = false;
          }
        }
      }, 2000); // Increased delay for better stability
      
      return () => clearTimeout(timer);
    });

    return () => {
      interaction.cancel();
    };
  }, [isReady, isLoggedIn, authLoading, shouldShowTutorial, startNetworkingTutorial, networkingTutorialCompleted]);

  // Listen for tutorial events
  useEffect(() => {
    const handleTutorialStop = () => {
      markTutorialCompleted('networking');
    };

    const handleStepChange = (step: any) => {
      // Track step progress
      if (step && step.order) {
        updateTutorialStep('networking', step.order);
      }
    };

    copilotEvents.on('stop', handleTutorialStop);
    copilotEvents.on('stepChange', handleStepChange);

    return () => {
      copilotEvents.off('stop', handleTutorialStop);
      copilotEvents.off('stepChange', handleStepChange);
    };
  }, [copilotEvents, markTutorialCompleted, updateTutorialStep]);

  const [statsState, setStatsState] = useState<StatsState>({
    data: {
      totalRequests: 0,
      pendingRequests: 0,
      acceptedRequests: 0,
      declinedRequests: 0,
      cancelledRequests: 0,
      blockedUsers: 0,
      scheduledMeetings: 0,
    },
    loading: true,
    error: null,
    lastUpdated: null,
    retryCount: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [tipsExpanded, setTipsExpanded] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const animatedHeight = useRef(new Animated.Value(0)).current;
  const animatedOpacity = useRef(new Animated.Value(0)).current;
  const tipSliderOpacity = useRef(new Animated.Value(1)).current;

  const networkingTips = [
    {
      icon: 'edit',
      color: '#FFC107',
      title: t({ id: 'networking.tips.beSpecific.title', message: 'Be Specific' }),
      description: t({ id: 'networking.tips.beSpecific.description', message: 'Include clear intentions in your meeting requests' })
    },
    {
      icon: 'schedule',
      color: '#4CAF50',
      title: t({ id: 'networking.tips.followUp.title', message: 'Follow Up' }),
      description: t({ id: 'networking.tips.followUp.description', message: 'Send follow-up messages for pending requests' })
    },
    {
      icon: 'people',
      color: '#2196F3',
      title: t({ id: 'networking.tips.networkSmart.title', message: 'Network Smart' }),
      description: t({ id: 'networking.tips.networkSmart.description', message: 'Focus on quality connections over quantity' })
    },
    {
      icon: 'star',
      color: '#9C27B0',
      title: t({ id: 'networking.tips.beProfessional.title', message: 'Be Professional' }),
      description: t({ id: 'networking.tips.beProfessional.description', message: 'Always maintain a professional tone in your messages' })
    },
    {
      icon: 'timeline',
      color: '#FF5722',
      title: t({ id: 'networking.tips.bePatient.title', message: 'Be Patient' }),
      description: t({ id: 'networking.tips.bePatient.description', message: 'Give speakers time to respond to your requests' })
    }
  ];

  const quickAccessItems: QuickAccessItem[] = [
    {
      id: 'find-speakers',
      title: t({ id: 'networking.quickAccessItems.findSpeakers.title', message: 'Find Speakers' }),
      icon: 'search',
      color: '#FF9800',
      route: '/events/bsl2025/speakers',
      subtitle: t({ id: 'networking.quickAccessItems.findSpeakers.subtitle', message: 'Browse all speakers' }),
    },
    {
      id: 'my-requests',
      title: t({ id: 'networking.quickAccessItems.yourRequest.title', message: 'Your Request' }),
      icon: 'mail',
      color: '#4CAF50',
      route: '/events/bsl2025/networking/my-requests',
      subtitle: t({ id: 'networking.quickAccessItems.yourRequest.subtitle', message: 'View sent and incoming requests' }),
    },
    {
      id: 'my-meetings',
      title: t({ id: 'networking.quickAccessItems.myMeetings.title', message: 'My Meetings' }),
      icon: 'event',
      color: '#3F51B5',
      route: '/events/bsl2025/networking/my-meetings',
      subtitle: t({ id: 'networking.quickAccessItems.myMeetings.subtitle', message: 'Your accepted/created meetings' }),
    },
    {
      id: 'my-schedule',
      title: t({ id: 'networking.quickAccessItems.mySchedule.title', message: 'My Schedule' }),
      icon: 'event-note',
      color: '#9C27B0',
      route: '/events/bsl2025/networking/my-schedule',
      subtitle: t({ id: 'networking.quickAccessItems.mySchedule.subtitle', message: 'View and manage your schedule' }),
    },
    {
      id: 'blocked-users',
      title: t({ id: 'networking.quickAccessItems.blockedUsers.title', message: 'Blocked Users' }),
      icon: 'block',
      color: '#F44336',
      route: '/events/bsl2025/networking/blocked',
      subtitle: t({ id: 'networking.quickAccessItems.blockedUsers.subtitle', message: 'Manage blocked users' }),
    },
    {
      id: 'analytics',
      title: t({ id: 'networking.quickAccessItems.analytics.title', message: 'Analytics' }),
      icon: 'bar-chart',
      color: '#607D8B',
      route: '/events/bsl2025/networking/analytics',
      subtitle: t({ id: 'networking.quickAccessItems.analytics.subtitle', message: 'View networking statistics' }),
    },
  ];

  // Define loadNetworkingStats BEFORE it's used in useEffect hooks
  const loadNetworkingStats = useCallback(async (retryCount = 0, silent = false) => {
    if (!user) {
      console.log('No user found, skipping networking stats load');
      setStatsState(prev => ({ ...prev, loading: false, error: 'No user found' }));
      return;
    }

    const maxRetries = 3;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s
    const REQUEST_TIMEOUT = 15000; // 15 second timeout for mobile networks

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout - network may be slow')), REQUEST_TIMEOUT);
    });

    try {
      // Only show loading state on initial load or manual refresh, not on real-time updates
      if (!silent) {
        setStatsState(prev => ({ 
          ...prev, 
          loading: true, 
          error: null,
          retryCount 
        }));
      }

      console.log(`🔄 Loading networking stats (attempt ${retryCount + 1}/${maxRetries + 1}) for user:`, user.id, silent ? '(silent update)' : '');

      // Use the RPC function for better performance and reliability
      // Add timeout to prevent stale loading states on slow mobile networks
      const statsPromise = supabase
        .rpc('get_user_meeting_request_counts', {
          p_user_id: user.id
        });

      const { data: statsData, error: statsError } = await Promise.race([
        statsPromise,
        timeoutPromise
      ]) as any;

      if (statsError) {
        console.error('❌ Stats RPC error:', statsError);
        throw new Error(`Stats API error: ${statsError.message}`);
      }

      if (!statsData) {
        throw new Error('No data returned from stats API');
      }

      console.log('📊 Stats RPC result:', statsData);

      // Check if user is a speaker and get additional speaker-specific data
      let speakerStats = {
        blockedUsers: 0,
        speakerRequests: 0
      };

      try {
        const { data: speakerData, error: speakerError } = await supabase
          .from('bsl_speakers')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (!speakerError && speakerData) {
          // Get speaker-specific stats
          const { data: blockedData } = await supabase
            .from('user_blocks')
            .select('id')
            .eq('speaker_id', speakerData.id);

          const { data: speakerRequestsData } = await supabase
            .from('meeting_requests')
            .select('id, status')
            .eq('speaker_id', speakerData.id);

          speakerStats = {
            blockedUsers: blockedData?.length || 0,
            speakerRequests: speakerRequestsData?.length || 0
          };

          console.log('🎤 Speaker stats:', speakerStats);
        }
      } catch (speakerError) {
        console.warn('⚠️ Could not load speaker stats:', speakerError);
        // Don't throw here, just use default values
      }

      // Calculate scheduled meetings (accepted requests)
      const scheduledMeetings = statsData.approved_requests || 0;

      const newStats: NetworkingStats = {
        totalRequests: statsData.total_requests || 0,
        pendingRequests: statsData.pending_requests || 0,
        acceptedRequests: statsData.approved_requests || 0,
        declinedRequests: statsData.declined_requests || 0,
        cancelledRequests: statsData.cancelled_requests || 0,
        blockedUsers: speakerStats.blockedUsers,
        scheduledMeetings: scheduledMeetings,
      };

      console.log('✅ Networking stats loaded successfully:', newStats);

      setStatsState(prev => ({
        data: newStats,
        loading: false,
        error: null,
        lastUpdated: new Date(),
        retryCount: 0
      }));

    } catch (error) {
      console.error(`❌ Error loading networking stats (attempt ${retryCount + 1}):`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (retryCount < maxRetries) {
        console.log(`🔄 Retrying in ${retryDelay}ms...`);
        setTimeout(() => {
          loadNetworkingStats(retryCount + 1);
        }, retryDelay);
      } else {
        console.error('❌ Max retries reached, showing error state');
        setStatsState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
          retryCount: 0
        }));
        
        showError('Failed to Load Stats', `Unable to load networking statistics after ${maxRetries + 1} attempts. ${errorMessage}`);
      }
    }
  }, [user, showError]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    if (user) {
      loadNetworkingStats();
      
      // Safety timeout: if loading takes more than 20 seconds, show error
      timeoutId = setTimeout(() => {
        if (isMounted) {
          setStatsState(prev => {
            if (prev.loading) {
              console.warn('⚠️ Loading timeout reached, showing error state');
              return {
                ...prev,
                loading: false,
                error: 'Loading took too long. Please check your connection and try again.',
                retryCount: 0
              };
            }
            return prev;
          });
        }
      }, 20000); // 20 second safety timeout
    } else {
      // If no user, set loading to false immediately
      setStatsState(prev => ({ ...prev, loading: false }));
    }

    return () => {
      isMounted = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [user, loadNetworkingStats]);

  // Refresh stats when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user) {
        console.log('📊 Screen focused, refreshing stats...');
        loadNetworkingStats(0, true); // Silent update when refocusing
      }
    }, [user, loadNetworkingStats])
  );

  // Real-time subscription for meeting requests to update stats automatically
  useEffect(() => {
    if (!user) return;

    console.log('🔄 Setting up real-time stats subscription for user:', user.id);

    // Channel for sent requests (where user is requester)
    const sentChannel = supabase
      .channel(`networking_stats_sent_${user.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_requests',
          filter: `requester_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('📊 Stats: SENT request changed:', payload.eventType);
          // Debounce stats reload to avoid too many calls
          setTimeout(() => {
            loadNetworkingStats(0, true); // Silent update (no loading state)
          }, 500);
        }
      )
      .subscribe((status) => {
        console.log('📡 Stats SENT subscription status:', status);
      });

    // Channel for incoming requests (where user is speaker)
    const incomingChannel = supabase
      .channel(`networking_stats_incoming_${user.id}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_requests',
          filter: `speaker_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('📊 Stats: INCOMING request changed:', payload.eventType);
          // Debounce stats reload to avoid too many calls
          setTimeout(() => {
            loadNetworkingStats(0, true); // Silent update (no loading state)
          }, 500);
        }
      )
      .subscribe((status) => {
        console.log('📡 Stats INCOMING subscription status:', status);
      });

    // Cleanup
    return () => {
      console.log('🧹 Cleaning up stats subscriptions...');
      supabase.removeChannel(sentChannel);
      supabase.removeChannel(incomingChannel);
    };
  }, [user, loadNetworkingStats]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNetworkingStats();
    setRefreshing(false);
  };

  const handleRetry = () => {
    loadNetworkingStats();
  };

  // Auto-rotate tips when closed
  useEffect(() => {
    if (!tipsExpanded) {
      const interval = setInterval(rotateTip, 7000); // Rotate every 7 seconds
      return () => clearInterval(interval);
    }
  }, [tipsExpanded]);

  const rotateTip = () => {
    if (!tipsExpanded) {
      Animated.sequence([
        Animated.timing(tipSliderOpacity, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(tipSliderOpacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
      
      setCurrentTipIndex((prevIndex) => 
        (prevIndex + 1) % networkingTips.length
      );
    }
  };

  const toggleTipsDropdown = () => {
    const toValue = tipsExpanded ? 0 : 1;
    
    Animated.parallel([
      Animated.timing(animatedHeight, {
        toValue: toValue,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(animatedOpacity, {
        toValue: toValue,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
    
    setTipsExpanded(!tipsExpanded);
  };

  const handleQuickAccess = (item: QuickAccessItem) => {
    // Check if user is trying to access speaker dashboard
    if (item.id === 'speaker-dashboard' && user?.email !== 'ecalderon@unal.edu.co') {
      showError('Access Denied', 'Only speakers can access the speaker dashboard');
      return;
    }

    router.push(item.route as any);
  };



  const renderStatsCard = (title: string, value: number, icon: string, color: string) => (
    <View style={styles.statsCard}>
      <View style={[styles.statsIcon, { backgroundColor: color }]}>
        <MaterialIcons name={icon as any} size={24} color="white" />
      </View>
      <Text style={styles.statsValue}>{value}</Text>
      <Text style={styles.statsTitle}>{title}</Text>
    </View>
  );

  return (
    <>
      <Stack.Screen 
        options={{ 
          title: 'Networking',
        }} 
      />
      {statsState.loading && !statsState.data.totalRequests && !statsState.data.pendingRequests ? (
        <LoadingScreen
          icon="network-check"
          message="Loading networking stats..."
          retryCount={statsState.retryCount}
          fullScreen={true}
        />
      ) : statsState.error && !statsState.data.totalRequests && !statsState.data.pendingRequests ? (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={48} color="#F44336" />
          <Text style={styles.errorTitle}>Failed to Load Stats</Text>
          <Text style={styles.errorMessage}>{statsState.error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <MaterialIcons name="refresh" size={20} color="white" />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          {statsState.lastUpdated && (
            <Text style={styles.lastUpdatedText}>
              Last updated: {statsState.lastUpdated.toLocaleTimeString()}
            </Text>
          )}
        </View>
      ) : (
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <MaterialIcons name="people-alt" size={32} color={colors.primary} />
          <Text style={styles.headerTitle}>{t({ id: 'networking.title', message: 'Networking Center' })}</Text>
          <Text style={styles.headerSubtitle}>{t({ id: 'networking.subtitle', message: 'Connect with speakers and attendees' })}</Text>
        </View>

      {/* Statistics Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ id: 'networking.stats.title', message: 'Your Networking Stats' })}</Text>
        <View style={styles.statsGrid}>
          {renderStatsCard(t({ id: 'networking.stats.totalRequests', message: 'Total Requests' }), statsState.data.totalRequests, 'send', '#4CAF50')}
          {renderStatsCard(t({ id: 'networking.stats.pending', message: 'Pending' }), statsState.data.pendingRequests, 'schedule', '#FF9800')}
          {renderStatsCard(t({ id: 'networking.stats.accepted', message: 'Accepted' }), statsState.data.acceptedRequests, 'check-circle', '#4CAF50')}
          {renderStatsCard(t({ id: 'networking.stats.declined', message: 'Declined' }), statsState.data.declinedRequests, 'cancel', '#F44336')}
          {renderStatsCard(t({ id: 'networking.stats.cancelled', message: 'Cancelled' }), statsState.data.cancelledRequests, 'close', '#9E9E9E')}
          {renderStatsCard(t({ id: 'networking.stats.scheduled', message: 'Scheduled' }), statsState.data.scheduledMeetings, 'event', '#2196F3')}
          {renderStatsCard(t({ id: 'networking.stats.blocked', message: 'Blocked' }), statsState.data.blockedUsers, 'block', '#F44336')}
        </View>
      </View>

      {/* Quick Access Section */}
      <CopilotStep text="Welcome to the Networking Center! Use the Quick Access cards below to navigate. 'Find Speakers' lets you browse and request meetings. 'My Requests' shows your meeting requests. 'My Schedule' helps you manage your calendar." order={100} name="networkingQuickAccess">
        <CopilotView>
          <QuickAccessGrid
            items={quickAccessItems.map(item => ({
              id: item.id,
              title: item.title,
              subtitle: item.subtitle,
              icon: item.icon,
              color: item.color,
              route: item.route
            }))}
            title={t({ id: 'networking.quickAccess', message: 'Quick Access' })}
            showScrollArrows={true}
            cardWidth={160}
            cardSpacing={12}
            onItemPress={handleQuickAccess}
          />
        </CopilotView>
      </CopilotStep>

      {/* Recent Activity Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t({ id: 'networking.recentActivity.title', message: 'Recent Activity' })}</Text>
        <View style={styles.activityCard}>
          <MaterialIcons name="history" size={24} color={colors.primary} />
          <View style={styles.activityContent}>
            <Text style={styles.activityTitle}>{t({ id: 'networking.recentActivity.journey', message: 'Your Networking Journey' })}</Text>
            <Text style={styles.activityDescription}>
              {t({ 
                id: 'networking.recentActivity.description', 
                message: 'You\'ve sent {totalRequests} meeting requests and have {pendingRequests} pending responses.' 
              }).replace('{totalRequests}', String(statsState.data.totalRequests)).replace('{pendingRequests}', String(statsState.data.pendingRequests))}
            </Text>
          </View>
        </View>
      </View>

      {/* Tips Section */}
      <View style={styles.section}>
        <TouchableOpacity 
          style={styles.tipsHeader} 
          onPress={toggleTipsDropdown}
          activeOpacity={0.7}
        >
          <View style={styles.tipsHeaderContent}>
            <MaterialIcons 
              name="lightbulb" 
              size={24} 
              color="#FFC107"
              style={styles.headerIcon}
            />
            <View style={styles.tipsHeaderText}>
              <Text style={styles.tipsSectionTitle}>{t({ id: 'networking.tips.title', message: 'Networking Tips' })}</Text>
              <Animated.View 
                style={[
                  styles.tipTextRow,
                  { opacity: tipSliderOpacity }
                ]}
              >
                <MaterialIcons 
                  name={networkingTips[currentTipIndex]?.icon as any} 
                  size={14} 
                  color={networkingTips[currentTipIndex]?.color}
                  style={styles.tipTextIcon}
                />
                <Text style={styles.tipsSummary}>
                  {tipsExpanded 
                    ? t({ id: 'networking.tips.summary', message: '5 helpful tips for better networking' })
                    : `${networkingTips[currentTipIndex]?.title}: ${networkingTips[currentTipIndex]?.description}`
                  }
                </Text>
              </Animated.View>
            </View>
          </View>
          <MaterialIcons 
            name={tipsExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
            size={24} 
            color={colors.text?.secondary || (isDark ? '#cccccc' : '#666666')} 
          />
        </TouchableOpacity>
        
        <Animated.View 
          style={[
            styles.tipsDropdown,
            {
              height: animatedHeight.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 300], // Adjust based on content height
              }),
              opacity: animatedOpacity,
            }
          ]}
        >
          <View style={styles.tipsList}>
            {networkingTips.map((tip, index) => (
              <View 
                key={tip.title} 
                style={[
                  styles.tipItem, 
                  index === networkingTips.length - 1 && styles.lastTipItem
                ]}
              >
                <MaterialIcons 
                  name={tip.icon as any} 
                  size={20} 
                  color={tip.color} 
                  style={styles.tipIcon} 
                />
                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                  <Text style={styles.tipDescription}>{tip.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </View>
      </ScrollView>
      )}
    </>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background?.default || (isDark ? '#121212' : '#ffffff'),
  },
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider || (isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.08)'),
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#F0F0F0' : '#666666'),
    marginTop: 4,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginBottom: 16,
  },
  tipsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginBottom: 4,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tipsHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    alignSelf: 'center',
  },
  tipsHeaderText: {
    marginLeft: 12,
    flex: 1,
    justifyContent: 'center',
  },
  tipTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  tipTextIcon: {
    marginRight: 6,
  },
  tipsSummary: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#F0F0F0' : '#666666'),
    fontStyle: 'italic',
    flex: 1,
  },
  tipsDropdown: {
    overflow: 'hidden',
  },
  tipsList: {
    paddingVertical: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statsCard: {
    width: '30%',
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  statsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginBottom: 4,
  },
  statsTitle: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#F0F0F0' : '#666666'),
    textAlign: 'center',
  },
  activityCard: {
    flexDirection: 'row',
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activityContent: {
    flex: 1,
    marginLeft: 12,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginBottom: 4,
  },
  activityDescription: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#F0F0F0' : '#666666'),
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
  },
  lastTipItem: {
    borderBottomWidth: 0,
  },
  tipIcon: {
    marginRight: 12,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginBottom: 4,
  },
  tipDescription: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#F0F0F0' : '#666666'),
    lineHeight: 20,
  },
  // Error state styles
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    color: colors.text?.secondary || (isDark ? '#F0F0F0' : '#666666'),
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary || '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  lastUpdatedText: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#F0F0F0' : '#666666'),
    fontStyle: 'italic',
  },
  retryText: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#F0F0F0' : '#666666'),
    marginTop: 8,
    textAlign: 'center',
  },
});
