import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ticket, ChevronLeft, ChevronRight, ExternalLink, Shield, CheckCircle } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';

interface BlockchainTicket {
  id: string;
  eventName: string;
  date: string;
  location: string;
  accessLevel: string;
  nftId: string;
  contractAddress: string;
  network: string;
  image?: string;
  qrCode: string;
  verified: boolean;
}

const BlockchainTicketsView = () => {
  const { colors } = useTheme();
  const { t } = useTranslation('wallet');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedQR, setExpandedQR] = useState<string | null>(null);
  const qrScale = useSharedValue(1);
  const screenWidth = Dimensions.get('window').width;
  const paddingHorizontal = screenWidth < 400 ? 16 : 24;

  // Mock blockchain tickets - in production, these would come from blockchain queries
  const [tickets] = useState<BlockchainTicket[]>([
    // Example: BSL2025 NFT ticket
    {
      id: 'nft-1',
      eventName: 'Blockchain Summit Latam 2025',
      date: 'November 12-14, 2025',
      location: 'Universidad EAFIT, Medellín',
      accessLevel: 'VIP',
      nftId: 'BSL2025-VIP-001',
      contractAddress: '0x...',
      network: 'Voi Network',
      image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=500&q=80',
      qrCode: 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=blockchain-ticket-nft-1',
      verified: true,
    },
  ]);

  const qrAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: qrScale.value }],
    };
  });

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < tickets.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const toggleQRCode = (qrCode: string) => {
    if (expandedQR === qrCode) {
      qrScale.value = withSpring(1);
      setTimeout(() => setExpandedQR(null), 300);
    } else {
      setExpandedQR(qrCode);
      qrScale.value = withSpring(1.5);
    }
  };

  if (tickets.length === 0) {
    return (
      <View style={{ paddingHorizontal }}>
        <View
          style={{
            backgroundColor: colors.background.paper,
            borderRadius: 16,
            padding: 32,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.divider,
          }}
        >
          <Ticket size={64} color={colors.text.secondary} />
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: colors.text.primary,
              marginTop: 16,
              marginBottom: 8,
            }}
          >
            {t('tickets.noBlockchainTickets')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: colors.text.secondary,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            {t('tickets.noBlockchainTicketsDesc')}
          </Text>
          <TouchableOpacity
            style={{
              backgroundColor: colors.primary,
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontWeight: '600',
                fontSize: 14,
              }}
            >
              {t('tickets.viewEvents')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const currentTicket = tickets[currentIndex];

  return (
    <View style={{ paddingHorizontal }}>
      <View
        style={{
          backgroundColor: colors.background.paper,
          borderRadius: 16,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.divider,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 3,
        }}
      >
        {/* Ticket Image */}
        {currentTicket.image && (
          <Image
            source={{ uri: currentTicket.image }}
            style={{ width: '100%', height: 200 }}
            contentFit="cover"
            transition={200}
          />
        )}

        <View style={{ padding: 20 }}>
          {/* Verification Badge */}
          {currentTicket.verified && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#10b98120',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                alignSelf: 'flex-start',
                marginBottom: 12,
              }}
            >
              <Shield size={14} color="#10b981" />
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: '#10b981',
                  marginLeft: 6,
                }}
              >
                {t('tickets.blockchainVerified')}
              </Text>
            </View>
          )}

          {/* Event Info */}
          <Text
            style={{
              fontSize: 22,
              fontWeight: '700',
              color: colors.text.primary,
              marginBottom: 8,
            }}
          >
            {currentTicket.eventName}
          </Text>

          <View style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 14,
                color: colors.text.secondary,
                marginBottom: 4,
              }}
            >
              {currentTicket.date}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: colors.text.secondary,
              }}
            >
              {currentTicket.location}
            </Text>
          </View>

          {/* Access Level */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <View
              style={{
                backgroundColor: `${colors.primary}20`,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                marginRight: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.primary,
                }}
              >
                {currentTicket.accessLevel}
              </Text>
            </View>
          </View>

          {/* Blockchain Info */}
          <View
            style={{
              backgroundColor: colors.background.default,
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: colors.text.secondary,
                marginBottom: 8,
              }}
            >
              {t('tickets.blockchainInfo')}
            </Text>
            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.text.secondary,
                  marginBottom: 2,
                }}
              >
                {t('tickets.network')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.text.primary,
                }}
              >
                {currentTicket.network}
              </Text>
            </View>
            <View style={{ marginBottom: 8 }}>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.text.secondary,
                  marginBottom: 2,
                }}
              >
                {t('tickets.nftId')}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.text.primary,
                  fontFamily: 'monospace',
                }}
              >
                {currentTicket.nftId}
              </Text>
            </View>
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginTop: 8,
              }}
            >
              <ExternalLink size={14} color={colors.primary} />
              <Text
                style={{
                  fontSize: 12,
                  color: colors.primary,
                  marginLeft: 6,
                  fontWeight: '600',
                }}
              >
                {t('tickets.viewOnExplorer')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* QR Code */}
          <TouchableOpacity
            style={{ alignItems: 'center' }}
            onPress={() => toggleQRCode(currentTicket.qrCode)}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                expandedQR === currentTicket.qrCode ? qrAnimatedStyle : {},
                {
                  backgroundColor: '#fff',
                  padding: 8,
                  borderRadius: 8,
                },
              ]}
            >
              <Image
                source={{ uri: currentTicket.qrCode }}
                style={{ width: 128, height: 128 }}
                contentFit="contain"
              />
            </Animated.View>
            <Text
              style={{
                fontSize: 12,
                color: colors.text.secondary,
                marginTop: 8,
              }}
            >
              {expandedQR === currentTicket.qrCode
                ? t('tickets.tapToMinimize')
                : t('tickets.tapToEnlarge')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Navigation Controls */}
      {tickets.length > 1 && (
        <>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 16,
              paddingHorizontal: 24,
            }}
          >
            <TouchableOpacity
              style={{
                padding: 12,
                borderRadius: 24,
                backgroundColor:
                  currentIndex === 0
                    ? colors.background.paper
                    : colors.primary,
              }}
              onPress={handlePrevious}
              disabled={currentIndex === 0}
            >
              <ChevronLeft
                size={24}
                color={currentIndex === 0 ? colors.text.secondary : '#fff'}
              />
            </TouchableOpacity>

            <Text
              style={{
                fontSize: 14,
                color: colors.text.secondary,
              }}
            >
              {currentIndex + 1} {t('tickets.of')} {tickets.length}
            </Text>

            <TouchableOpacity
              style={{
                padding: 12,
                borderRadius: 24,
                backgroundColor:
                  currentIndex === tickets.length - 1
                    ? colors.background.paper
                    : colors.primary,
              }}
              onPress={handleNext}
              disabled={currentIndex === tickets.length - 1}
            >
              <ChevronRight
                size={24}
                color={
                  currentIndex === tickets.length - 1
                    ? colors.text.secondary
                    : '#fff'
                }
              />
            </TouchableOpacity>
          </View>

          {/* Dots Indicator */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              marginTop: 16,
              gap: 8,
            }}
          >
            {tickets.map((_, index) => (
              <View
                key={index}
                style={{
                  width: index === currentIndex ? 24 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor:
                    index === currentIndex
                      ? colors.primary
                      : colors.divider,
                }}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
};

export default BlockchainTicketsView;

