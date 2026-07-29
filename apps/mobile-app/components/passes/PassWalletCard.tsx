import React, { useState } from 'react';
import {
  Alert,
  ImageBackground,
  Modal,
  Platform,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import { passSystemService } from '../../lib/pass-system';
import type { WalletPass } from '../../lib/pass-wallet';
import DynamicQRDisplay from '../DynamicQRDisplay';
import PassTiltCard from './PassTiltCard';
import NotchMaskedCard from './NotchMaskedCard';

// The original ticket proportions. Kept exact: the layout below positions the
// perforation, notches and stats block as percentages of this height, so
// changing it silently drifts all three out of alignment.
export const PASS_CARD_WIDTH = 340;
export const PASS_CARD_HEIGHT = 390;

interface PassWalletCardProps {
  pass: WalletPass;
  /** Disables the flip/QR/share controls while the card sits behind others. */
  interactive?: boolean;
}

const PassWalletCard: React.FC<PassWalletCardProps> = ({ pass, interactive = true }) => {
  const { t: translate } = useTranslation('passes');
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [showQRModal, setShowQRModal] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  const t = (translation: { id: string; message: string }) => {
    try {
      const key = translation.id.startsWith('passes.')
        ? translation.id.replace(/^passes\./, '')
        : translation.id;
      const translated = translate(key, {});
      if (!translated || translated === key || translated.startsWith('passes.')) {
        return translation.message;
      }
      return translated;
    } catch {
      return translation.message;
    }
  };

  const passEventShortName = pass.eventName;
  const passEventDate = pass.eventDateLabel;

  const flipRotation = useSharedValue(0);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
    flipRotation.value = withSpring(isFlipped ? 0 : 180, {
      damping: 15,
      stiffness: 100,
    });
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipRotation.value, [0, 180], [0, 180]);
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
    };
  });

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
      const shareMessage = `Check out my ${passTypeDisplay} pass for ${passEventShortName}!\n\nPass Number: ${pass.pass_number}\nPass Type: ${passTypeDisplay}\n\nPresent this QR code at the event entrance.`;

      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `${passEventShortName} ${passTypeDisplay} Pass`,
          text: shareMessage,
        });
      } else if (Platform.OS !== 'web' && Share.share) {
        await Share.share({
          message: shareMessage,
          title: `${passEventShortName} ${passTypeDisplay} Pass`,
        });
      } else {
        await Clipboard.setStringAsync(shareMessage);
        Alert.alert(
          t({ id: 'passes.copiedTitle', message: 'Pass Information Copied' }),
          t({ id: 'passes.copiedMessage', message: 'Pass information has been copied to your clipboard. You can paste it anywhere to share.' }),
          [{ text: t({ id: 'passes.alert.ok', message: 'OK' }) }]
        );
      }
    } catch (error: any) {
      if (error?.message?.includes('cancel') || error?.message?.includes('AbortError')) {
        return;
      }

      try {
        const passTypeDisplay = passSystemService.getPassTypeDisplayName(pass.pass_type);
        const shareMessage = `Check out my ${passTypeDisplay} pass for ${passEventShortName}!\n\nPass Number: ${pass.pass_number}\nPass Type: ${passTypeDisplay}\n\nPresent this QR code at the event entrance.`;
        await Clipboard.setStringAsync(shareMessage);
        Alert.alert(
          t({ id: 'passes.copiedTitle', message: 'Pass Information Copied' }),
          t({ id: 'passes.copiedMessage', message: 'Pass information has been copied to your clipboard. You can paste it anywhere to share.' }),
          [{ text: t({ id: 'passes.alert.ok', message: 'OK' }) }]
        );
      } catch (clipboardError) {
        console.error('Error copying to clipboard:', clipboardError);
        Alert.alert(
          t({ id: 'passes.alert.errorTitle', message: 'Error' }),
          t({ id: 'passes.copyError', message: 'Unable to share pass. Please try again.' })
        );
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

  const renderFrontCard = () => (
    <View style={{
      // Shadow host only. iOS clips a view's own shadow when that same view
      // also has overflow:'hidden' (which the notch mask applies internally
      // to its content), so the shadow has to live one layer outside it.
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
      borderRadius: 16,
      width: '100%',
      height: PASS_CARD_HEIGHT,
    }}>
      <NotchMaskedCard
        style={{ width: '100%', height: '100%' }}
        geometry={{ width: PASS_CARD_WIDTH, height: PASS_CARD_HEIGHT, cornerRadius: 16, notchRadius: 11, notchYRatio: 0.58 }}
      >
      <View style={{
        backgroundColor: colors.background.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.divider,
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}>
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
              {passEventShortName ? `${passEventShortName} • ` : ''}{getPassTypeLabel(pass.pass_type)} {t({ id: 'passes.pass', message: 'Pass' })}
            </Text>
            <Text style={{
              fontSize: 9,
              color: colors.text.secondary,
              opacity: 0.8
            }}>
              {passEventDate || t({ id: 'passes.date', message: 'Nov 12-14, 2025' })}
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
              {(pass.pass_type || '').toUpperCase()}
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
                {(pass.pass_number || '').length > 12
                  ? `#${pass.pass_number.slice(0, 6)}...${pass.pass_number.slice(-4)}`
                  : `#${pass.pass_number || ''}`}
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
                {(pass.status || '').toUpperCase()}
              </Text>
            </View>
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
          disabled={!interactive}
          onPress={() => setShowQRModal(true)}
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
          disabled={!interactive}
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
          disabled={!interactive}
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
      </View>
      </View>
      </NotchMaskedCard>
    </View>
  );

  const renderBackCard = () => (
    <View style={{
      // Shadow host only -- see the matching comment in renderFrontCard.
      shadowColor: colors.text.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
      borderRadius: 16,
      width: '100%',
      height: PASS_CARD_HEIGHT,
    }}>
      <NotchMaskedCard
        style={{ width: '100%', height: '100%' }}
        geometry={{ width: PASS_CARD_WIDTH, height: PASS_CARD_HEIGHT, cornerRadius: 16, notchRadius: 11, notchYRatio: 0.58 }}
      >
      <View style={{
        backgroundColor: colors.background.paper,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.divider,
        width: '100%',
        height: '100%',
        flexDirection: 'column',
      }}>
      {/* Dotted Ticket Perforation Line */}
      <View style={{
        position: 'absolute',
        left: '5%',
        right: '5%',
        top: '58%',
        height: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateY: -0.5 }],
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
          disabled={!interactive}
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
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <MaterialIcons name="event" size={18} color={colors.text.secondary} />
            <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }} numberOfLines={1}>
              {passEventShortName}{passEventDate ? ` • ${passEventDate}` : ''}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <MaterialIcons name="label" size={18} color={colors.text.secondary} />
            <Text style={{ fontSize: 12, color: colors.text.secondary, marginLeft: 8 }}>
              {getPassTypeLabel(pass.pass_type)} {t({ id: 'passes.pass', message: 'Pass' })} • {(pass.status || '').toUpperCase()}
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

      {/* Full Details Button */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: '79%',
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
          transform: [{ translateY: -21 }]
        }}
        disabled={!interactive}
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
          disabled={!interactive}
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
          disabled={!interactive}
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
          disabled={!interactive}
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
      </View>
      </View>
      </NotchMaskedCard>
    </View>
  );

  return (
    <View style={{ width: '100%', height: PASS_CARD_HEIGHT }}>
      <PassTiltCard
        accentColor={getPassTypeColor(pass.pass_type)}
        isDark={isDark}
        disabled={!interactive}
        style={{ width: '100%', height: PASS_CARD_HEIGHT, borderRadius: 16 }}
      >
        <View style={{ width: '100%', height: PASS_CARD_HEIGHT }}>
          <Animated.View
            style={[
              { position: 'absolute', width: '100%', height: PASS_CARD_HEIGHT },
              frontAnimatedStyle,
            ]}
          >
            {renderFrontCard()}
          </Animated.View>

          <Animated.View
            style={[
              { position: 'absolute', width: '100%', height: PASS_CARD_HEIGHT },
              backAnimatedStyle,
            ]}
          >
            {renderBackCard()}
          </Animated.View>
        </View>
      </PassTiltCard>

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        animationType="slide"
        transparent
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
              showRefreshButton
              autoRefresh
              refreshInterval={30}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default PassWalletCard;
