import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, FlatList, ImageBackground, Modal, Share, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolate } from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { passSystemService, PassInfo, PassRequestLimits } from '@/lib/pass-system';
import { supabase } from '@/lib/supabase';
import DynamicQRDisplay from './DynamicQRDisplay';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from '@/i18n/i18n';

interface PassesDisplayProps {
  // Display mode
  mode?: 'dashboard' | 'speaker';
  
  // Speaker-specific props
  speakerId?: string;
  boostAmount?: number;
  showRequestButton?: boolean;
  onRequestPress?: () => void;
  
  // Callbacks
  onPassInfoLoaded?: (passInfo: PassInfo | null) => void;
  onRequestLimitsLoaded?: (limits: PassRequestLimits) => void;
  
  // Dashboard-specific props
  showTitle?: boolean;
  title?: string;
  showPassComparison?: boolean;
  
  // Refresh trigger
  refreshTrigger?: number;
}

export default function PassesDisplay({
  mode = 'dashboard',
  speakerId,
  boostAmount = 0,
  showRequestButton = false,
  onRequestPress,
  onPassInfoLoaded,
  onRequestLimitsLoaded,
  showTitle = true,
  title,
  showPassComparison = false,
  refreshTrigger
}: PassesDisplayProps) {
  const { t: translate } = useTranslation('passes');
  const { colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [passInfo, setPassInfo] = useState<PassInfo | null>(null);
  const [requestLimits, setRequestLimits] = useState<PassRequestLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showComparison, setShowComparison] = useState(showPassComparison);
  
  // Helper function to translate
  // Note: useTranslation('passes') already sets the namespace, so remove 'passes.' prefix if present
  const t = (translation: { id: string; message: string }) => {
    try {
      // Remove 'passes.' prefix if present since useTranslation('passes') already adds it
      const key = translation.id.startsWith('passes.') 
        ? translation.id.replace(/^passes\./, '') 
        : translation.id;
      const translated = translate(key, {});
      // If translation returns the key itself (not found), use the fallback message
      if (!translated || translated === key || translated.startsWith('passes.')) {
        return translation.message;
      }
      return translated;
    } catch {
      return translation.message;
    }
  };
  
  // Demo mode check
  const isDemoMode = process.env.NODE_ENV === 'development';

  useEffect(() => {
    loadPassInfo();
  }, [user, refreshTrigger]);

  useEffect(() => {
    if (speakerId && user) {
      loadRequestLimits();
    }
  }, [speakerId, user, boostAmount, refreshTrigger]);

  const loadPassInfo = async () => {
    if (!user) {
      setLoading(false);
      setPassInfo(null);
      setInitialLoad(false);
      return;
    }

    setLoading(true);
    try {
      const info = await passSystemService.getUserPassInfo(user.id);
      setPassInfo(info);
      onPassInfoLoaded?.(info);
    } catch (error) {
      console.error('Error loading pass info:', error);
      setPassInfo(null);
    } finally {
      setLoading(false);
      // Add a small delay to prevent flash of "No Pass Found"
      setTimeout(() => {
        setInitialLoad(false);
      }, 300);
    }
  };

  const loadRequestLimits = async () => {
    if (!user || !speakerId) return;

    try {
      const limits = await passSystemService.canMakeMeetingRequest(
        user.id,
        speakerId,
        boostAmount
      );
      setRequestLimits(limits);
      onRequestLimitsLoaded?.(limits);
    } catch (error) {
      console.error('Error loading request limits:', error);
      // Set error state using passInfo if available, otherwise use defaults
      if (passInfo) {
        setRequestLimits({
          can_request: false,
          canSendRequest: false,
          reason: 'Error checking limits',
          pass_type: passInfo.pass_type,
          remaining_requests: passInfo.remaining_requests || 0,
          remaining_boost: passInfo.remaining_boost || 0,
        });
      } else {
        setRequestLimits({
          can_request: false,
          canSendRequest: false,
          reason: 'Error checking limits',
          pass_type: null,
          remaining_requests: 0,
          remaining_boost: 0,
        });
      }
    }
  };


  const createDefaultPass = async (passType: 'general' | 'business' | 'vip' = 'general') => {
    if (!user) return;

    try {
      const passId = await passSystemService.createDefaultPass(user.id, passType);
      if (passId) {
        Alert.alert(translate('alert.createdTitle', {}),
          undefined,
          [{ text: translate('alert.ok', {}), onPress: loadPassInfo }]
        );
      }
    } catch (error) {
      console.error('Error creating pass:', error);
      Alert.alert(translate('alert.errorTitle', {}), translate('alert.createFail', {}));
    }
  };

  const getPassTypeColor = (passType: string) => {
    return passSystemService.getPassTypeColor(passType as any);
  };

  const getPassTypeDisplayName = (passType: string) => {
    return passSystemService.getPassTypeDisplayName(passType as any);
  };

  // Dashboard mode - show passes in list format
  if (mode === 'dashboard') {
    if (loading || initialLoad) {
      return (
        <View style={{ 
          padding: 20, 
          alignItems: 'center',
          backgroundColor: colors.background.paper,
          borderRadius: 12,
          margin: 16,
          borderWidth: 1,
          borderColor: colors.divider
        }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{ color: colors.text.secondary, marginTop: 8 }}>
            {t({ id: 'passes.loading', message: 'Loading your pass information...' })}
          </Text>
        </View>
      );
    }

    if (!passInfo) {
      return (
        <View style={{ 
          padding: 20, 
          backgroundColor: colors.background.paper,
          borderRadius: 12,
          margin: 16,
          borderWidth: 1,
          borderColor: colors.divider
        }}>
          {showTitle && (
            <Text style={{ 
              fontSize: 18, 
              fontWeight: '600', 
              color: colors.text.primary,
              marginBottom: 16
            }}>
              {title || t({ id: 'passes.title', message: 'Your Event Passes' })}
            </Text>
          )}
          
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <MaterialIcons name="confirmation-number" size={48} color={colors.text.secondary} />
            <Text style={{ 
              fontSize: 16, 
              fontWeight: '600', 
              color: colors.text.primary,
              marginTop: 12,
              marginBottom: 8
            }}>
              {t({ id: 'passes.noPassFound', message: 'No passes found' })}
            </Text>
            <Text style={{ 
              color: colors.text.secondary, 
              textAlign: 'center',
              marginBottom: 20
            }}>
              {t({ id: 'passes.contactSupport', message: 'Contact support to get your event passes' })}
            </Text>
          </View>
        </View>
      );
    }

    // Dashboard mode with pass - show as horizontal scrollable cards
    return (
      <View>
        {showTitle && (
          <Text style={{ 
            fontSize: 18, 
            fontWeight: '600', 
            color: colors.text.primary,
            marginBottom: 16
          }}>
            {title || t({ id: 'passes.title', message: 'Your Event Passes' })}
          </Text>
        )}
        
        <View style={{ minHeight: 520, marginHorizontal: -4 }}>
          <FlatList
            data={[passInfo]}
            renderItem={({ item }) => (
              <View style={{ width: 340, marginRight: 20, paddingHorizontal: 4 }}>
                <PassCard pass={item} refreshTrigger={refreshTrigger} />
              </View>
            )}
            keyExtractor={item => item.pass_id}
            horizontal={true}
            showsHorizontalScrollIndicator={true}
            scrollEnabled={true}
            contentContainerStyle={{ paddingRight: 20, paddingLeft: 4 }}
          />
        </View>
      </View>
    );
  }

  // Speaker mode - show detailed pass info with request functionality
  if (loading || initialLoad) {
    return (
      <View style={{ 
        padding: 20, 
        alignItems: 'center',
        backgroundColor: colors.background.paper,
        borderRadius: 12,
        margin: 16,
        borderWidth: 1,
        borderColor: colors.divider
      }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ color: colors.text.secondary, marginTop: 8 }}>
          {t({ id: 'passes.loading', message: 'Loading your pass information...' })}
        </Text>
      </View>
    );
  }

  if (!passInfo) {
    return (
      <View style={{ 
        padding: 20, 
        backgroundColor: colors.background.paper,
        borderRadius: 12,
        margin: 16,
        borderWidth: 1,
        borderColor: colors.divider
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <MaterialIcons name="confirmation-number" size={24} color={colors.text.secondary} />
          <Text style={{ 
            fontSize: 18, 
            fontWeight: '600', 
            color: colors.text.primary,
            marginLeft: 8
          }}>
            {t({ id: 'passes.noPassFound', message: 'No passes found' })}
          </Text>
        </View>
        
        <Text style={{ 
          color: colors.text.secondary, 
          marginBottom: 16,
          lineHeight: 20
        }}>
          {isDemoMode 
            ? t({ id: 'passes.noPassMessage.demo', message: "You need a pass to request meetings with speakers. Without a pass, you cannot send meeting requests. Choose your pass type:" })
            : t({ id: 'passes.noPassMessage.production', message: "You need a valid event pass to request meetings with speakers. Please purchase a pass to continue." })
          }
        </Text>

        {isDemoMode ? (
          <>
            {/* Pass Comparison Toggle - Demo Mode Only */}
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                backgroundColor: colors.background.default,
                borderRadius: 8,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: colors.divider
              }}
              onPress={() => setShowComparison(!showComparison)}
              activeOpacity={0.7}
            >
              <Text style={{
                fontSize: 14,
                fontWeight: '600',
                color: colors.text.primary
              }}>
                {t({ id: 'passes.passTypes.all', message: 'All Pass Types & Pricing' })} {showComparison ? '(Open)' : '(Closed)'}
              </Text>
              <MaterialIcons
                name={showComparison ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                size={24}
                color={colors.text.secondary}
              />
            </TouchableOpacity>

            {/* Pass Comparison Content - Demo Mode Only */}
            {showComparison && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{
              fontSize: 12,
              color: colors.text.secondary,
              marginBottom: 12,
              textAlign: 'center'
            }}>
              {t({ id: 'passes.passComparison.compare', message: 'Compare features and choose the right pass for your needs' })}
            </Text>

            <View style={{ gap: 12 }}>
              {/* General Pass */}
              <TouchableOpacity
                style={{
                  padding: 16,
                  backgroundColor: colors.background.default,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.divider
                }}
                onPress={() => createDefaultPass('general')}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary }}>
                    {t({ id: 'passes.type.general', message: 'General' })}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#34A853' }}>
                    $99
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                  {t({ id: 'passes.passPerks.general.conferences', message: 'Conferences only' })}
                </Text>
                <View style={{ gap: 6 }}>
                  {passSystemService.getPassPerks('general').features.map((feature, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                  {passSystemService.getPassPerks('general').perks.map((perk, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {perk}
                      </Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>

              {/* Business Pass */}
              <TouchableOpacity
                style={{
                  padding: 16,
                  backgroundColor: colors.background.default,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.divider
                }}
                onPress={() => createDefaultPass('business')}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary }}>
                    {t({ id: 'passes.type.business', message: 'Business' })}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#007AFF' }}>
                    $249
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                  {t({ id: 'passes.passPerks.business.networking', message: '+ Networking & B2B sessions' })}
                </Text>
                <View style={{ gap: 6 }}>
                  {passSystemService.getPassPerks('business').features.map((feature, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                  {passSystemService.getPassPerks('business').perks.map((perk, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {perk}
                      </Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>

              {/* VIP Pass */}
              <TouchableOpacity
                style={{
                  padding: 16,
                  backgroundColor: colors.background.default,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.divider
                }}
                onPress={() => createDefaultPass('vip')}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary }}>
                    {t({ id: 'passes.type.vip', message: 'VIP' })}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFD700' }}>
                    Premium
                  </Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                  {t({ id: 'passes.passPerks.vip.networking', message: '+ VIP networking with speakers' })}
                </Text>
                <View style={{ gap: 6 }}>
                  {passSystemService.getPassPerks('vip').features.map((feature, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                  {passSystemService.getPassPerks('vip').perks.map((perk, index) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {perk}
                      </Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
          </>
        ) : (
          /* Production Mode - Show Payment Options */
          <View style={{ marginBottom: 16 }}>
            <View style={{
              padding: 16,
              backgroundColor: colors.background.default,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.divider,
              marginBottom: 12
            }}>
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: colors.text.primary,
                marginBottom: 8
              }}>
                {t({ id: 'passes.purchasePass', message: 'Purchase Event Pass' })}
              </Text>
              <Text style={{
                fontSize: 14,
                color: colors.text.secondary,
                marginBottom: 12
              }}>
                {t({ id: 'passes.purchasePass.description', message: 'Choose from our available pass types to access speaker meetings and networking opportunities.' })}
              </Text>
              
              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 12,
                    backgroundColor: colors.background.paper,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.divider
                  }}
                  onPress={() => {
                    // TODO: Implement real payment flow
                    Alert.alert(t({ id: 'passes.alert.paymentTitle', message: 'Payment Integration' }), t({ id: 'passes.alert.paymentMessage', message: 'Payment system will be implemented here' }));
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#34A85320',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8
                    }}>
                      <MaterialIcons name="person" size={16} color="#34A853" />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>
                      {t({ id: 'passes.type.general', message: 'General' })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#34A853' }}>
                    $99
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 12,
                    backgroundColor: colors.background.paper,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.divider
                  }}
                  onPress={() => {
                    // TODO: Implement real payment flow
                    Alert.alert(t({ id: 'passes.alert.paymentTitle', message: 'Payment Integration' }), t({ id: 'passes.alert.paymentMessage', message: 'Payment system will be implemented here' }));
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#007AFF20',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8
                    }}>
                      <MaterialIcons name="business" size={16} color="#007AFF" />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>
                      {t({ id: 'passes.type.business', message: 'Business' })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#007AFF' }}>
                    $249
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 12,
                    backgroundColor: colors.background.paper,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.divider
                  }}
                  onPress={() => {
                    // TODO: Implement real payment flow
                    Alert.alert(t({ id: 'passes.alert.paymentTitle', message: 'Payment Integration' }), t({ id: 'passes.alert.paymentMessage', message: 'Payment system will be implemented here' }));
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#FFD70020',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8
                    }}>
                      <MaterialIcons name="star" size={16} color="#FFD700" />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text.primary }}>
                      {t({ id: 'passes.type.vip', message: 'VIP' })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFD700' }}>
                    Premium
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Request Button - Clickable to redirect to auth when no pass */}
        {showRequestButton && onRequestPress && (
          <TouchableOpacity
            style={{
              backgroundColor: colors.primary,
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 8,
              alignItems: 'center',
              marginTop: 16
            }}
            onPress={onRequestPress}
            activeOpacity={0.7}
          >
            <Text style={{ 
              color: 'white',
              fontSize: 16,
              fontWeight: '600'
            }}>
              {t({ id: 'passes.button.requestMeeting', message: 'Request Meeting' })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={{ 
      padding: 20, 
      backgroundColor: colors.background.paper,
      borderRadius: 12,
      margin: 16,
      borderWidth: 1,
      borderColor: colors.divider
    }}>
      {/* Pass Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
        <View style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: `${getPassTypeColor(passInfo.pass_type)}20`,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 12
        }}>
          <MaterialIcons 
            name={passInfo.pass_type === 'vip' ? 'star' : passInfo.pass_type === 'business' ? 'business' : 'person'} 
            size={24} 
            color={getPassTypeColor(passInfo.pass_type)} 
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ 
            fontSize: 20, 
            fontWeight: '700', 
            color: colors.text.primary
          }}>
            {getPassTypeDisplayName(passInfo.pass_type)}
          </Text>
          <TouchableOpacity
            onPress={() => {
              router.push('/(shared)/dashboard/pass-details');
            }}
            activeOpacity={0.7}
          >
            <Text style={{ 
              fontSize: 14, 
              color: colors.primary,
              textDecorationLine: 'underline'
            }}>
              Pass #{passInfo.pass_number && passInfo.pass_number.length > 12 
                ? `${passInfo.pass_number.slice(0, 6)}...${passInfo.pass_number.slice(-4)}` 
                : passInfo.pass_number || 'Unknown'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          backgroundColor: `${getPassTypeColor(passInfo.pass_type)}20`,
          borderRadius: 16
        }}>
          <Text style={{ 
            fontSize: 12, 
            fontWeight: '600', 
            color: getPassTypeColor(passInfo.pass_type)
          }}>
            {passInfo.status.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Pass Stats */}
      <View style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-between',
        marginBottom: 16
      }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text.primary }}>
            {passInfo.max_requests || 0}
          </Text>
          <Text style={{ fontSize: 12, color: colors.text.secondary, textAlign: 'center' }}>
            {translate('meetingRequests', {})}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text.primary }}>
            {passInfo.max_boost || 0}
          </Text>
          <Text style={{ fontSize: 12, color: colors.text.secondary, textAlign: 'center' }}>
            BOOST
          </Text>
        </View>
      </View>

      {/* Pass Comparison Toggle - Only show if user has a pass AND in demo mode */}
      {passInfo && isDemoMode && (
        <TouchableOpacity 
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 12,
            backgroundColor: colors.background.default,
            borderRadius: 8,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: colors.divider
          }}
          onPress={() => setShowComparison(!showComparison)}
          activeOpacity={0.7}
        >
          <Text style={{ 
            fontSize: 14, 
            fontWeight: '600', 
            color: colors.text.primary
          }}>
            {t({ id: 'passes.passTypes.all', message: 'All Pass Types & Pricing' })} {showComparison ? '(Open)' : '(Closed)'}
          </Text>
          <MaterialIcons 
            name={showComparison ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
            size={24} 
            color={colors.text.secondary} 
          />
        </TouchableOpacity>
      )}

      {/* Pass Comparison Content - Only show if user has a pass AND in demo mode */}
      {passInfo && showComparison && isDemoMode && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ 
            fontSize: 12, 
            color: colors.text.secondary,
            marginBottom: 12,
            textAlign: 'center'
          }}>
            {t({ id: 'passes.passComparison.compare', message: 'Compare features and choose the right pass for your needs' })}
          </Text>
          
          {/* Current Pass Info */}
          {passInfo && (
            <View style={{
              padding: 12,
              backgroundColor: `${getPassTypeColor(passInfo.pass_type)}20`,
              borderRadius: 8,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: getPassTypeColor(passInfo.pass_type)
            }}>
              <Text style={{ 
                fontSize: 14, 
                fontWeight: '600', 
                color: colors.text.primary,
                marginBottom: 4
              }}>
                {t({ id: 'passes.currentPass', message: 'Your Current Pass' })}: {getPassTypeDisplayName(passInfo.pass_type)}
              </Text>
              <Text style={{
                fontSize: 12, 
                color: colors.text.secondary
              }}>
                {passInfo.pass_type === 'general' ? '5' : passInfo.pass_type === 'business' ? '20' : '50'} {t({ id: 'passes.meetingRequests', message: 'Meeting Requests' })} • {passInfo.pass_type === 'general' ? '100' : passInfo.pass_type === 'business' ? '300' : '500'} {t({ id: 'passes.voiBoost', message: 'VOI Boost' })}
              </Text>
            </View>
          )}
          
          <View style={{ gap: 12 }}>
            {/* General Pass */}
            <View style={{
              padding: 16,
              backgroundColor: colors.background.default,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: passInfo?.pass_type === 'general' ? '#34A853' : colors.divider
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary }}>
                  {t({ id: 'passes.type.general', message: 'General' })}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#34A853' }}>
                  $99
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                {t({ id: 'passes.passPerks.general.conferences', message: 'Conferences only' })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService.getPassPerks('general').features.map((feature, index) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {feature}
                    </Text>
                  </View>
                ))}
                {passSystemService.getPassPerks('general').perks.map((perk, index) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {perk}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Business Pass */}
            <View style={{
              padding: 16,
              backgroundColor: colors.background.default,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: passInfo?.pass_type === 'business' ? '#007AFF' : colors.divider
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary }}>
                  {t({ id: 'passes.type.business', message: 'Business' })}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#007AFF' }}>
                  $249
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                {t({ id: 'passes.passPerks.business.networking', message: '+ Networking & B2B sessions' })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService.getPassPerks('business').features.map((feature, index) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {feature}
                    </Text>
                  </View>
                ))}
                {passSystemService.getPassPerks('business').perks.map((perk, index) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {perk}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* VIP Pass */}
            <View style={{
              padding: 16,
              backgroundColor: colors.background.default,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: passInfo?.pass_type === 'vip' ? '#FFD700' : colors.divider
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text.primary }}>
                  {t({ id: 'passes.type.vip', message: 'VIP' })}
                </Text>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFD700' }}>
                  Premium
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                {t({ id: 'passes.passPerks.vip.networking', message: '+ VIP networking with speakers' })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService.getPassPerks('vip').features.map((feature, index) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {feature}
                    </Text>
                  </View>
                ))}
                {passSystemService.getPassPerks('vip').perks.map((perk, index) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {perk}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Request Limits - Only show if user has a pass */}
      {passInfo && requestLimits && (
        <View style={{ 
          padding: 12,
          backgroundColor: requestLimits.canSendRequest ? `${colors.primary}10` : `${colors.error}10`,
          borderRadius: 8,
          marginBottom: 16
        }}>
          <Text style={{ 
            fontSize: 14, 
            fontWeight: '600', 
            color: requestLimits.canSendRequest ? colors.primary : colors.error.main,
            marginBottom: 4
          }}>
            {requestLimits.canSendRequest ? t({ id: 'passes.canRequestMeeting', message: '✅ Can Request Meeting' }) : t({ id: 'passes.cannotRequestMeeting', message: '❌ Cannot Request Meeting' })}
          </Text>
          <Text style={{ 
            fontSize: 12, 
            color: colors.text.secondary
          }}>
            {requestLimits.reason || passSystemService.getPassValidationMessage(requestLimits)}
          </Text>
        </View>
      )}

      {/* Request Button - Always show but disabled when no pass or limit reached */}
      {showRequestButton && onRequestPress && (
        <TouchableOpacity
          style={{
            backgroundColor: (passInfo && requestLimits?.canSendRequest) ? colors.primary : colors.divider,
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 8,
            alignItems: 'center',
            opacity: (passInfo && requestLimits?.canSendRequest) ? 1 : 0.5
          }}
          onPress={(passInfo && requestLimits?.canSendRequest) ? onRequestPress : undefined}
          disabled={!passInfo || !requestLimits?.canSendRequest}
        >
          <Text style={{ 
            color: (passInfo && requestLimits?.canSendRequest) ? 'white' : colors.text.secondary,
            fontSize: 16,
            fontWeight: '600'
          }}>
            {!passInfo ? t({ id: 'passes.button.passRequired', message: 'Pass Required' }) : 
             !requestLimits?.canSendRequest ? t({ id: 'passes.button.limitReached', message: 'Limit Reached' }) :
             t({ id: 'passes.button.requestMeeting', message: 'Request Meeting' })}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// PassCard component for dashboard mode - enhanced ticket-style design with flip animation
const PassCard = ({ pass, refreshTrigger }: { pass: PassInfo; refreshTrigger?: number }) => {
  const { t: translate } = useTranslation('passes');
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const [showQRModal, setShowQRModal] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [meetingRequests, setMeetingRequests] = useState<any[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  
  // Helper function to translate
  // Note: useTranslation('passes') already sets the namespace, so remove 'passes.' prefix if present
  const t = (translation: { id: string; message: string }) => {
    try {
      // Remove 'passes.' prefix if present since useTranslation('passes') already adds it
      const key = translation.id.startsWith('passes.') 
        ? translation.id.replace(/^passes\./, '') 
        : translation.id;
      const translated = translate(key, {});
      // If translation returns the key itself (not found), use the fallback message
      if (!translated || translated === key || translated.startsWith('passes.')) {
        return translation.message;
      }
      return translated;
    } catch {
      return translation.message;
    }
  };
  
  // Flip animation values
  const flipRotation = useSharedValue(0);
  
  // Load meeting requests when component mounts, pass changes, or refreshTrigger changes
  useEffect(() => {
    if (user && pass.pass_id) {
      loadMeetingRequests();
    }
  }, [user, pass.pass_id, refreshTrigger]);
  
  const loadMeetingRequests = async () => {
    if (!user) return;
    
    setLoadingRequests(true);
    try {
      const { data, error } = await supabase
        .from('meeting_requests')
        .select('id, speaker_name, status, boost_amount, created_at')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) {
        console.error('Error loading meeting requests:', error);
        setMeetingRequests([]);
      } else {
        setMeetingRequests(data || []);
      }
    } catch (error) {
      console.error('Error in loadMeetingRequests:', error);
      setMeetingRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  };
  
  // Get initials from speaker name
  const getInitials = (name: string): string => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };
  
  // Handle flip animation
  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    flipRotation.value = withSpring(isFlipped ? 0 : 180, {
      damping: 15,
      stiffness: 100,
    });
  };
  
  // Front card animated style
  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipRotation.value, [0, 180], [0, 180]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
    };
  });
  
  // Back card animated style
  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipRotation.value, [0, 180], [180, 360]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
    };
  });
  
  const handleShare = async () => {
    try {
      const passTypeDisplay = passSystemService.getPassTypeDisplayName(pass.pass_type);
      const shareMessage = `Check out my ${passTypeDisplay} pass for BSL 2025!\n\nPass Number: ${pass.pass_number}\nPass Type: ${passTypeDisplay}\n\nPresent this QR code at the event entrance.`;

      // Check if Share API is available (works on mobile and some browsers)
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        // Use Web Share API if available
        await navigator.share({
          title: `BSL 2025 ${passTypeDisplay} Pass`,
          text: shareMessage,
        });
      } else if (Platform.OS !== 'web' && Share.share) {
        // Use React Native Share on mobile
        await Share.share({
          message: shareMessage,
          title: `BSL 2025 ${passTypeDisplay} Pass`,
        });
      } else {
        // Fallback: Copy to clipboard for browsers without Share API
        await Clipboard.setStringAsync(shareMessage);
        Alert.alert(
          t({ id: 'passes.copiedTitle', message: 'Pass Information Copied' }),
          t({ id: 'passes.copiedMessage', message: 'Pass information has been copied to your clipboard. You can paste it anywhere to share.' }),
          [{ text: t({ id: 'passes.alert.ok', message: 'OK' })}]
        );
      }
    } catch (error: any) {
      // If share was cancelled, don't show error
      if (error?.message?.includes('cancel') || error?.message?.includes('AbortError')) {
        return;
      }
      
      // For other errors, fallback to clipboard
      try {
        const passTypeDisplay = passSystemService.getPassTypeDisplayName(pass.pass_type);
        const shareMessage = `Check out my ${passTypeDisplay} pass for BSL 2025!\n\nPass Number: ${pass.pass_number}\nPass Type: ${passTypeDisplay}\n\nPresent this QR code at the event entrance.`;
        await Clipboard.setStringAsync(shareMessage);
        Alert.alert(
          t({ id: 'passes.copiedTitle', message: 'Pass Information Copied' }),
          t({ id: 'passes.copiedMessage', message: 'Pass information has been copied to your clipboard. You can paste it anywhere to share.' }),
          [{ text: t({ id: 'passes.alert.ok', message: 'OK' })}]
        );
      } catch (clipboardError) {
        console.error('Error copying to clipboard:', clipboardError);
        Alert.alert(t({ id: 'passes.alert.errorTitle', message: 'Error' }), t({ id: 'passes.copyError', message: 'Unable to share pass. Please try again.' }));
      }
    }
  };
  
  const getPassTypeColor = (type: string) => {
    switch (type) {
      case 'business': return '#007AFF';
      case 'vip': return '#FF9500';
      case 'general': return '#34A853';
      default: return '#8E8E93';
    }
  };

  const getPassTypeLabel = (type: string) => {
    switch (type) {
      case 'business': return t({ id: 'passes.type.business', message: 'Business' });
      case 'vip': return t({ id: 'passes.type.vip', message: 'VIP' });
      case 'general': return t({ id: 'passes.type.general', message: 'General' });
      default: return t({ id: 'passes.type.event', message: 'Event' });
    }
  };

  const getPassImage = (type: string) => {
    switch (type) {
      case 'business': return 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=400&h=200&fit=crop';
      case 'vip': return 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=400&h=200&fit=crop';
      case 'general': return 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=200&fit=crop';
      default: return 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=200&fit=crop';
    }
  };

  const getPassAccess = (type: string) => {
    switch (type) {
      case 'business': return t({ id: 'passes.access.business', message: 'B2B + Closing Party' });
      case 'vip': return t({ id: 'passes.access.vip', message: 'All VIP Benefits' });
      case 'general': return t({ id: 'passes.access.general', message: 'General Access' });
      default: return t({ id: 'passes.access.event', message: 'Event Access' });
    }
  };

  // Front card content
  const renderFrontCard = () => (
    <View style={{
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
      overflow: 'visible', // Changed to visible to show ticket notches
      width: '100%',
      height: 390, // Fixed height (25% less than 520)
      flexDirection: 'column',
    }}>
      {/* Ticket-style side notches */}
      <View style={{
        position: 'absolute',
        left: -8,
        top: '58%',
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.background.default,
        zIndex: 1,
        transform: [{ translateY: -8 }]
      }} />
      <View style={{
        position: 'absolute',
        right: -8,
        top: '58%',
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.background.default,
        zIndex: 1,
        transform: [{ translateY: -8 }]
      }} />
      {/* Content wrapper with overflow hidden for internal content */}
      <View style={{ overflow: 'hidden', height: '100%', flexDirection: 'column', position: 'relative', borderRadius: 15 }}>
      {/* Ticket Header */}
      <View style={{
        padding: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
        position: 'relative',
        zIndex: 2,
        backgroundColor: colors.background.paper
      }}>
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8
        }}>
          <View style={{ flex: 1, marginRight: 8, minWidth: 0 }}>
            <Text 
              style={{ 
                fontSize: 12,
                fontWeight: '700',
                color: colors.text.primary,
                maxWidth: '100%',
                flexShrink: 1,
                lineHeight: 16,
                letterSpacing: -0.1,
                marginBottom: 1
              }}
              numberOfLines={1}
              ellipsizeMode="middle"
              minimumFontScale={0.8}
              adjustsFontSizeToFit
            >
              {getPassTypeLabel(pass.pass_type)} {t({ id: 'passes.pass', message: 'Pass' })}
            </Text>
            <Text style={{ 
              fontSize: 9, 
              color: colors.text.secondary,
              opacity: 0.8
            }}>
              {t({ id: 'passes.date', message: 'Nov 12-14, 2025' })}
            </Text>
          </View>
          <View style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: getPassTypeColor(pass.pass_type),
            borderRadius: 16,
            marginLeft: 8,
            flexShrink: 0
          }}>
            <Text style={{ 
              fontSize: 12, 
              fontWeight: '700', 
              color: '#FFFFFF'
            }}>
              {pass.pass_type.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
      
      {/* Ticket Image Container - Extends from top to dotted line (58% of card) */}
      <View style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: '42%', // Adjusted to match dotted line at 58%
        zIndex: 0,
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
        overflow: 'hidden'
      }}>
        <ImageBackground
          source={{ uri: getPassImage(pass.pass_type) }}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
          imageStyle={{
            opacity: 0.3,
            resizeMode: 'cover'
          }}
        >
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: `${getPassTypeColor(pass.pass_type)}20`
          }} />
          <View style={{
            position: 'absolute',
            bottom: 12,
            left: 16,
            right: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end'
          }}>
            <View>
              <Text style={{ 
                fontSize: 15, 
                fontWeight: '700', 
                color: isDark ? '#FFFFFF' : colors.text.primary,
                marginBottom: 4,
                textShadowColor: 'rgba(0, 0, 0, 0.3)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 2
              }}>
                {getPassAccess(pass.pass_type)}
              </Text>
              <Text 
                style={{ 
                  fontSize: 13, 
                  color: isDark ? 'rgba(255, 255, 255, 0.9)' : colors.text.secondary,
                  maxWidth: 140,
                  fontFamily: 'monospace',
                  fontWeight: '600',
                  textShadowColor: 'rgba(0, 0, 0, 0.3)',
                  textShadowOffset: { width: 0, height: 1 },
                  textShadowRadius: 2
                }}
                numberOfLines={1}
                ellipsizeMode="head"
              >
                {pass.pass_number.length > 12 
                  ? `#${pass.pass_number.slice(0, 6)}...${pass.pass_number.slice(-4)}` 
                  : `#${pass.pass_number}`}
              </Text>
            </View>
            <View style={{
              backgroundColor: colors.background.paper,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.divider,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 3,
              elevation: 2
            }}>
              <Text style={{ 
                fontSize: 11, 
                fontWeight: '700', 
                color: getPassTypeColor(pass.pass_type)
              }}>
                {pass.status.toUpperCase()}
              </Text>
            </View>
          </View>
          
          {/* BSL2025 Logo Seal - Top right corner */}
          <View style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: colors.background.paper,
            borderWidth: 3,
            borderColor: getPassTypeColor(pass.pass_type),
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 5,
            zIndex: 10
          }}>
            <Text style={{ 
              fontSize: 9, 
              fontWeight: '800', 
              color: getPassTypeColor(pass.pass_type),
              letterSpacing: 0.5
            }}>
              BSL2025
            </Text>
          </View>
        </ImageBackground>
      </View>
      
      {/* Dotted Ticket Perforation Line - 90% width, centered at 58% height (aligned with side notches) */}
      <View style={{
        position: 'absolute',
        left: '5%',
        right: '5%',
        top: '58%',
        height: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateY: -0.5 }], // Center the line
        zIndex: 2
      }}>
        {Array.from({ length: 25 }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 8,
              height: 1,
              backgroundColor: colors.divider,
              marginHorizontal: 2
            }}
          />
        ))}
      </View>
      
      {/* Ticket Stats - Requests and VOI Boost - Centered between dotted line and footer */}
      <View style={{ 
        flexDirection: 'row', 
        justifyContent: 'space-around',
        paddingHorizontal: 16,
        paddingVertical: 12,
        position: 'absolute',
        top: '72%', // Centered between dotted line (58%) and footer (bottom)
        left: 0,
        right: 0,
        alignItems: 'center',
        transform: [{ translateY: -40 }] // Center the stats vertically in the available space
      }}>
        <View style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Text style={{ 
            fontSize: 24, 
            fontWeight: '700', 
            color: colors.text.primary,
            textShadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2
          }}>
            {pass.remaining_requests}
          </Text>
          <Text style={{ 
            fontSize: 10, 
            color: isDark ? colors.text.primary : colors.text.secondary, 
            textAlign: 'center', 
            marginTop: 4,
            fontWeight: '600'
          }}>
            {translate('requestsLeft', {})}
          </Text>
          <Text style={{ 
            fontSize: 9, 
            color: colors.text.secondary, 
            textAlign: 'center', 
            marginTop: 2,
            opacity: 0.8
          }}>
            {pass.used_requests} / {pass.max_requests} {t({ id: 'passes.used', message: 'used' })}
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: colors.divider, marginHorizontal: 8, height: 50 }} />
        <View style={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
          <Text style={{ 
            fontSize: 24, 
            fontWeight: '700', 
            color: (isDark ? '#FFB84D' : (typeof colors.warning === 'string' ? colors.warning : '#FF9500')) as any,
            textShadowColor: isDark ? 'rgba(255, 184, 77, 0.5)' : 'rgba(255, 149, 0, 0.2)',
            textShadowOffset: { width: 0, height: 1 },
            textShadowRadius: 2
          }}>
            {pass.remaining_boost}
          </Text>
          <Text style={{ 
            fontSize: 10, 
            color: isDark ? '#FFFFFF' : colors.text.secondary, 
            textAlign: 'center', 
            marginTop: 4,
            fontWeight: '700'
          }}>
            {translate('boostLeft', {})}
          </Text>
          <Text style={{ 
            fontSize: 9, 
            color: isDark ? 'rgba(255, 255, 255, 0.9)' : colors.text.secondary, 
            textAlign: 'center', 
            marginTop: 2,
            opacity: 0.8
          }}>
            {pass.used_boost} / {pass.max_boost} {t({ id: 'passes.used', message: 'used' })}
          </Text>
        </View>
      </View>
      
      {/* Ticket Footer Actions */}
      <View style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.background.paper
      }}>
        <TouchableOpacity 
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            borderRightWidth: 1,
            borderRightColor: colors.divider
          }}
          onPress={() => {
            // Navigate to QR view page or show modal
            setShowQRModal(true);
          }}
        >
          <MaterialIcons name="qr-code" size={16} color="#4A90E2" />
          <Text style={{ 
            fontSize: 12, 
            fontWeight: '600', 
            color: '#4A90E2',
            marginLeft: 4
          }}>
            {t({ id: 'passes.qrCode', message: 'QR Code' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            borderRightWidth: 1,
            borderRightColor: colors.divider
          }}
          onPress={handleFlip}
        >
          <MaterialIcons name="info" size={16} color="#4A90E2" />
          <Text style={{ 
            fontSize: 12, 
            fontWeight: '600', 
            color: '#4A90E2',
            marginLeft: 4
          }}>
            {t({ id: 'passes.details', message: 'Details' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12
          }}
          onPress={handleShare}
        >
          <MaterialIcons name="share" size={16} color="#4A90E2" />
          <Text style={{ 
            fontSize: 12, 
            fontWeight: '600', 
            color: '#4A90E2',
            marginLeft: 4
          }}>
            {t({ id: 'passes.share', message: 'Share' })}
          </Text>
        </TouchableOpacity>
      </View>
      </View> {/* Close content wrapper */}
    </View>
  );

  // Back card content - Resume/Summary version
  const renderBackCard = () => (
    <View style={{
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
      overflow: 'visible', // Changed to visible to show ticket notches
      width: '100%',
      height: 390, // Fixed height (25% less than 520, matching front card)
      flexDirection: 'column',
    }}>
      {/* Ticket-style side notches */}
      <View style={{
        position: 'absolute',
        left: -8,
        top: '58%',
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.background.default,
        zIndex: 1,
        transform: [{ translateY: -8 }]
      }} />
      <View style={{
        position: 'absolute',
        right: -8,
        top: '58%',
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: colors.background.default,
        zIndex: 1,
        transform: [{ translateY: -8 }]
      }} />
      {/* Dotted Ticket Perforation Line - 90% width, centered at 58% height (aligned with side notches) */}
      <View style={{
        position: 'absolute',
        left: '5%',
        right: '5%',
        top: '58%',
        height: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateY: -0.5 }], // Center the line
        zIndex: 1
      }}>
        {Array.from({ length: 25 }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 8,
              height: 1,
              backgroundColor: colors.divider,
              marginHorizontal: 2
            }}
          />
        ))}
      </View>
      {/* Content wrapper */}
      <View style={{ overflow: 'hidden', height: '100%', flexDirection: 'column', position: 'relative', borderRadius: 15 }}>
      {/* Ticket Header - Same as front */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 14,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.divider,
        borderTopLeftRadius: 15,
        borderTopRightRadius: 15,
        position: 'relative',
        zIndex: 2,
        backgroundColor: colors.background.paper
      }}>
        <View style={{ flex: 1, marginRight: 8, minWidth: 0 }}>
          <Text 
            style={{ 
              fontSize: 12,
              fontWeight: '700',
              color: colors.text.primary,
              maxWidth: '100%',
              flexShrink: 1,
              lineHeight: 16,
              letterSpacing: -0.1,
              marginBottom: 1
            }}
            numberOfLines={1}
            ellipsizeMode="middle"
            minimumFontScale={0.8}
            adjustsFontSizeToFit
          >
            {translate('passSummary', {})}
          </Text>
          <Text style={{ 
            fontSize: 9, 
            color: colors.text.secondary,
            opacity: 0.8
          }}>
            {translate('quickOverview', {})}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleFlip}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            backgroundColor: getPassTypeColor(pass.pass_type),
            borderRadius: 16,
            marginLeft: 8,
            flexShrink: 0
          }}
        >
          <MaterialIcons name="flip" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      
      {/* Summary Content */}
      <View style={{ flex: 1, padding: 16, paddingTop: 12, paddingBottom: 60, justifyContent: 'flex-start', position: 'relative' }}>
        {/* Pass Info Summary */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <MaterialIcons name="event" size={18} color={colors.text.secondary} />
            <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
              {t({ id: 'passes.bslDate', message: 'BSL 2025 • Nov 12-14, 2025' })}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <MaterialIcons name="label" size={18} color={colors.text.secondary} />
            <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
              {getPassTypeLabel(pass.pass_type)} {t({ id: 'passes.pass', message: 'Pass' })} • {pass.status.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Quick Access Info */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{
            fontSize: 11,
            fontWeight: '600',
            color: colors.text.primary,
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}>
            {translate('accessIncluded', {})}
          </Text>
          <Text style={{
            fontSize: 12,
            color: colors.text.secondary,
            lineHeight: 18
          }}>
            {getPassAccess(pass.pass_type)}
          </Text>
        </View>
      </View>

      {/* Full Details Button - Centered between dotted line and footer */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: '79%', // Centered between dotted line (58%) and footer (bottom)
          left: 16,
          right: 16,
          backgroundColor: getPassTypeColor(pass.pass_type),
          paddingVertical: 14,
          borderRadius: 10,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          shadowColor: getPassTypeColor(pass.pass_type),
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 4,
          transform: [{ translateY: -21 }] // Center the button vertically (half of button height ~42px)
        }}
        onPress={() => {
          handleFlip();
          router.push(`/dashboard/pass-details?passId=${pass.pass_id}` as any);
        }}
        activeOpacity={0.8}
      >
        <MaterialIcons name="info" size={18} color="#FFFFFF" />
        <Text style={{
          fontSize: 14,
          fontWeight: '700',
          color: '#FFFFFF',
          letterSpacing: 0.5
        }}>
          {t({ id: 'passes.viewFullDetails', message: 'View Full Details' })}
        </Text>
        <MaterialIcons name="arrow-forward" size={18} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Ticket Footer Actions - Same style as front */}
      <View style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: colors.background.paper
      }}>
        <TouchableOpacity 
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            borderRightWidth: 1,
            borderRightColor: colors.divider
          }}
          onPress={() => {
            handleFlip();
            setShowQRModal(true);
          }}
        >
          <MaterialIcons name="qr-code" size={16} color="#4A90E2" />
          <Text style={{ 
            fontSize: 12, 
            fontWeight: '600', 
            color: '#4A90E2',
            marginLeft: 4
          }}>
            {t({ id: 'passes.qrCode', message: 'QR Code' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12,
            borderRightWidth: 1,
            borderRightColor: colors.divider
          }}
          onPress={handleFlip}
        >
          <MaterialIcons name="flip" size={16} color="#4A90E2" />
          <Text style={{ 
            fontSize: 12, 
            fontWeight: '600', 
            color: '#4A90E2',
            marginLeft: 4
          }}>
            {t({ id: 'passes.flipBack', message: 'Flip Back' })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 12
          }}
          onPress={handleShare}
        >
          <MaterialIcons name="share" size={16} color="#4A90E2" />
          <Text style={{ 
            fontSize: 12, 
            fontWeight: '600', 
            color: '#4A90E2',
            marginLeft: 4
          }}>
            {t({ id: 'passes.share', message: 'Share' })}
          </Text>
        </TouchableOpacity>
      </View>
      </View> {/* Close content wrapper */}
    </View>
  );

  return (
    <View style={{
      marginBottom: 24,
      marginHorizontal: 0, // Remove horizontal margin, let parent handle spacing
      minHeight: 480, // Minimum height for flip animation, allows content to expand
      width: '100%',
    }}>
      {/* Flip Card Container */}
      <View style={{
        width: '100%',
        minHeight: 480,
      }}>
        {/* Front Card */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: '100%',
              minHeight: 480,
            },
            frontAnimatedStyle
          ]}
        >
          {renderFrontCard()}
        </Animated.View>

        {/* Back Card */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: '100%',
              minHeight: 480,
            },
            backAnimatedStyle
          ]}
        >
          {renderBackCard()}
        </Animated.View>
      </View>
      
      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowQRModal(false)}
      >
        <View style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 20
        }}>
          <View style={{
            backgroundColor: colors.background.paper,
            borderRadius: 20,
            padding: 24,
            width: '100%',
            maxWidth: 400,
            maxHeight: '90%'
          }}>
            <View style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20
            }}>
              <Text style={{
                fontSize: 20,
                fontWeight: '700',
                color: colors.text.primary
              }}>
                {t({ id: 'passes.qrCodeModalTitle', message: 'Your Pass QR Code' })}
              </Text>
              <TouchableOpacity
                onPress={() => setShowQRModal(false)}
                style={{
                  padding: 8,
                  borderRadius: 20,
                  backgroundColor: colors.background.paper
                }}
              >
                <MaterialIcons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>
            
            <DynamicQRDisplay
              passId={pass.pass_id}
              passNumber={pass.pass_number}
              passType={pass.pass_type}
              size={250}
              showRefreshButton={true}
              autoRefresh={true}
              refreshInterval={30}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

// Helper component for detail rows
const DetailRow = ({ icon, label, value, colors }: { icon: string; label: string; value: string; colors: any }) => (
  <View style={{
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  }}>
    <MaterialIcons name={icon as any} size={18} color={colors.text.secondary} />
    <View style={{ marginLeft: 12, flex: 1 }}>
      <Text style={{
        fontSize: 11,
        color: colors.text.secondary,
        marginBottom: 2
      }}>
        {label}
      </Text>
      <Text style={{
        fontSize: 14,
        fontWeight: '600',
        color: colors.text.primary
      }}>
        {value}
      </Text>
    </View>
  </View>
);
