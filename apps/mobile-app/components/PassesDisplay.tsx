import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '../lib/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { EventPassTier, passSystemService, PassInfo, PassRequestLimits, PassType } from '@/lib/pass-system';
import { useTranslation } from '@/i18n/i18n';
import * as Sentry from '@sentry/react-native';
import PassesWallet from './passes/PassesWallet';

interface PassesDisplayProps {
  // Display mode
  mode?: 'dashboard' | 'speaker';

  // Speaker-specific props
  speakerId?: string;
  boostAmount?: number;
  showRequestButton?: boolean;
  onRequestPress?: () => void;

  // Which event's pass to show (speaker mode). Falls back to the
  // tenant-resolved default event when omitted.
  eventId?: string;

  // Dashboard mode only: restrict the wallet to these events. Omit to show
  // every pass the user holds, across every event -- the default, and what
  // the "Your Passes" section wants.
  eventIds?: string[];

  // Callbacks
  onPassInfoLoaded?: (passInfo: PassInfo | null) => void;
  onRequestLimitsLoaded?: (limits: PassRequestLimits) => void;

  // Dashboard-specific props
  showTitle?: boolean;
  title?: string;
  showPassComparison?: boolean;

  // The main tenant uses the stacked wallet. Whitelabel event tenants can
  // request the legacy flat card row while they only expose a small number of
  // passes (for example BSL's Chile and Colombia passes).
  walletLayout?: 'stacked' | 'plain';

  // Refresh trigger
  refreshTrigger?: number;
}

function PassesDisplayInner({
  mode = 'dashboard',
  speakerId,
  boostAmount = 0,
  showRequestButton = false,
  onRequestPress,
  eventId,
  onPassInfoLoaded,
  onRequestLimitsLoaded,
  showPassComparison = false,
  refreshTrigger
}: PassesDisplayProps) {
  const { t: translate } = useTranslation('passes');
  const { colors } = useTheme();
  const { dbUserId } = useAuth();
  const router = useRouter();
  const [passInfo, setPassInfo] = useState<PassInfo | null>(null);
  const [requestLimits, setRequestLimits] = useState<PassRequestLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showComparison, setShowComparison] = useState(showPassComparison);
  const [eventPassTiers, setEventPassTiers] = useState<EventPassTier[]>([]);

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
  }, [dbUserId, refreshTrigger, eventId]);

  const passEventId = passInfo?.event_id || eventId;

  useEffect(() => {
    if (!passEventId) return;
    let isCurrent = true;

    void passSystemService.getEventPassTiers(passEventId).then((tiers: EventPassTier[]) => {
      if (isCurrent) setEventPassTiers(tiers);
    });

    return () => {
      isCurrent = false;
    };
  }, [passEventId]);

  const tiersByType = useMemo(
    () => new Map(eventPassTiers.map((tier) => [tier.pass_type, tier])),
    [eventPassTiers],
  );
  const currencyFormatters = useMemo(() => {
    const formatters = new Map<string, Intl.NumberFormat>();
    for (const currency of new Set(eventPassTiers.map((tier) => tier.currency || 'USD'))) {
      try {
        formatters.set(currency, new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }));
      } catch {
        // Invalid legacy currency values use the plain-text fallback below.
      }
    }
    return formatters;
  }, [eventPassTiers]);

  const getTier = (passType: PassType): EventPassTier | undefined => tiersByType.get(passType);
  const getTierPrice = (passType: PassType) => {
    const tier = getTier(passType);
    if (!tier) return '';
    if (tier.price_label) return tier.price_label;
    if (tier.price_cents === null) return '';
    const currency = tier.currency || 'USD';
    return currencyFormatters.get(currency)?.format(tier.price_cents / 100)
      ?? `${currency} ${(tier.price_cents / 100).toFixed(0)}`;
  };

  useEffect(() => {
    if (speakerId && dbUserId) {
      loadRequestLimits();
    }
  }, [speakerId, dbUserId, boostAmount, refreshTrigger]);

  const loadPassInfo = async () => {
    if (!dbUserId) {
      setLoading(false);
      setPassInfo(null);
      setInitialLoad(false);
      return;
    }

    setLoading(true);
    try {
      const info = await passSystemService.getUserPassInfo(dbUserId, eventId);
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
    if (!dbUserId || !speakerId) return;

    try {
      const limits = await passSystemService.canMakeMeetingRequest(
        dbUserId,
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
    if (!dbUserId) return;

    try {
      const passId = await passSystemService.createDefaultPass(dbUserId, passType);
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

  // Speaker mode - show detailed pass info with request functionality.
  // Dashboard mode never reaches here: PassesDisplayBoundary routes it to
  // PassesWallet before PassesDisplayInner renders.
  if (loading || initialLoad) {
    // Mirrors the "no passes found" card below (icon-and-title row, then a
    // message paragraph) instead of a stacked spinner+label, so loading and
    // empty read as the same visual family within this component.
    return (
      <View style={{
        padding: 20,
        backgroundColor: colors.background.paper,
        borderRadius: 12,
        margin: 16,
        borderWidth: 1,
        borderColor: colors.divider
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={{
            fontSize: 18,
            fontWeight: '600',
            color: colors.text.primary,
            marginLeft: 8
          }}>
            {t({ id: 'passes.loading', message: 'Loading your pass information...' })}
          </Text>
        </View>
        <Text style={{
          color: colors.text.secondary,
          lineHeight: 20
        }}>
          {t({ id: 'passes.loadingSubtitle', message: 'This should only take a moment.' })}
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
                  {passSystemService.getPassPerks('general').features.map((feature: string, index: number) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                  {passSystemService.getPassPerks('general').perks.map((perk: string, index: number) => (
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
                  {passSystemService.getPassPerks('business').features.map((feature: string, index: number) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                  {passSystemService.getPassPerks('business').perks.map((perk: string, index: number) => (
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
                  {passSystemService.getPassPerks('vip').features.map((feature: string, index: number) => (
                    <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                      <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                        {feature}
                      </Text>
                    </View>
                  ))}
                  {passSystemService.getPassPerks('vip').perks.map((perk: string, index: number) => (
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
            {t({ id: 'passes.boostPoints', message: 'Boost points' })}
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
                {passInfo.max_requests || 0} {t({ id: 'passes.meetingRequests', message: 'Meeting Requests' })} • {passInfo.max_boost || 0} {t({ id: 'passes.boostPoints', message: 'Boost points' })}
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
                  {getTierPrice('general')}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                {t({ id: 'passes.passPerks.general.conferences', message: 'Conferences only' })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService.getPassPerks('general').features.map((feature: string, index: number) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {feature}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                  <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                    {getTier('general')?.max_meeting_requests ?? passInfo.max_requests} {t({ id: 'passes.meetingRequests', message: 'Meeting Requests' })}
                  </Text>
                </View>
                {passSystemService.getPassPerks('general').perks.map((perk: string, index: number) => (
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
                  {getTierPrice('business')}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                {t({ id: 'passes.passPerks.business.networking', message: '+ Networking & B2B sessions' })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService.getPassPerks('business').features.map((feature: string, index: number) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {feature}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                  <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                    {getTier('business')?.max_meeting_requests ?? 0} {t({ id: 'passes.meetingRequests', message: 'Meeting Requests' })}
                  </Text>
                </View>
                {passSystemService.getPassPerks('business').perks.map((perk: string, index: number) => (
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
                  {getTierPrice('vip')}
                </Text>
              </View>
              <Text style={{ fontSize: 12, color: colors.text.secondary, marginBottom: 12 }}>
                {t({ id: 'passes.passPerks.vip.networking', message: '+ VIP networking with speakers' })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService.getPassPerks('vip').features.map((feature: string, index: number) => (
                  <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                      {feature}
                    </Text>
                  </View>
                ))}
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                  <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
                    {getTier('vip')?.max_meeting_requests ?? 0} {t({ id: 'passes.meetingRequests', message: 'Meeting Requests' })}
                  </Text>
                </View>
                {passSystemService.getPassPerks('vip').perks.map((perk: string, index: number) => (
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

// A malformed pass record (e.g. a null pass_type/status from a row the
// service layer didn't fully normalize) can throw during PassCard's render.
// That's a real defect to fix at the source, but this boundary is the
// backstop: it keeps a bad pass from taking down the whole dashboard, and
// reports the real error to Sentry so a future occurrence is diagnosable
// instead of showing up as a silent, unexplained close.
type PassesDisplayBoundaryState = { error: Error | null };

class PassesDisplayBoundary extends React.Component<PassesDisplayProps, PassesDisplayBoundaryState> {
  constructor(props: PassesDisplayProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): PassesDisplayBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[PassesDisplay] render error contained by boundary:', error?.message, info?.componentStack);
    Sentry.captureException(error, { contexts: { react: { componentStack: info?.componentStack } } });
  }

  render() {
    if (this.state.error) {
      return null;
    }

    // Dashboard mode is the "Your Passes" wallet: a searchable, filterable
    // list of every pass the user holds. It shares nothing with speaker mode
    // beyond this entry point (speaker mode is a single-pass eligibility
    // readout for one speaker's request form), so it renders its own
    // component rather than another branch inside PassesDisplayInner.
    if ((this.props.mode ?? 'dashboard') === 'dashboard') {
      return (
        <PassesWallet
          eventIds={this.props.eventIds}
          refreshTrigger={this.props.refreshTrigger}
          layout={this.props.walletLayout}
          onPassesLoaded={(passes: PassInfo[]) => this.props.onPassInfoLoaded?.(passes[0] ?? null)}
        />
      );
    }

    return <PassesDisplayInner {...this.props} />;
  }
}

export default function PassesDisplay(props: PassesDisplayProps) {
  return <PassesDisplayBoundary {...props} />;
}
