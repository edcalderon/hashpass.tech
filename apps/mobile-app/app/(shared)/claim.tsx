import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ActionButton, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import { MaterialIcons } from '../../lib/vector-icons';
import QRScanner from '../../components/QRScanner';

export default function ClaimTicketScreen() {
  const { isDark } = useTheme();
  const { t } = useTranslation('claimTickets');
  const router = useRouter();
  const [scannerVisible, setScannerVisible] = useState(false);
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);

  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/dashboard/wallet' as any);
  };

  const steps = [
    {
      title: t('ticketTitle', 'Have your original ticket ready'),
      body: t('ticketBody', 'Open the ticket email or app on another screen, or have the printed ticket ready.'),
    },
    {
      title: t('scanTitle', 'Scan its QR code'),
      body: t('scanBody', 'Allow camera access and hold the original ticket QR inside the frame.'),
    },
    {
      title: t('reviewTitle', 'Send it for review'),
      body: t('reviewBody', 'Choose the event and pass type. The event team will verify your ticket before linking a HASHPASS pass to your account.'),
    },
  ];

  return (
    <>
      <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: palette.canvas }}>
        <View
          style={{
            width: '100%',
            maxWidth: 680,
            alignSelf: 'center',
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: uiTokens.space.lg,
            minHeight: uiTokens.control.minHeight + uiTokens.space.sm,
          }}
        >
          <TouchableOpacity
            onPress={handleBackPress}
            accessibilityRole="button"
            accessibilityLabel={t('back', 'Go back')}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{
              width: uiTokens.control.compactHeight,
              height: uiTokens.control.compactHeight,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: uiTokens.space.sm,
            }}
          >
            <MaterialIcons name="arrow-back" size={24} color={palette.text} />
          </TouchableOpacity>
          <Text
            accessibilityRole="header"
            style={{
              color: palette.text,
              fontSize: uiTokens.type.title,
              fontWeight: '700',
              flexShrink: 1,
            }}
          >
            {t('title', 'Claim a ticket')}
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            width: '100%',
            maxWidth: 680,
            alignSelf: 'center',
            paddingHorizontal: uiTokens.space.lg,
            paddingTop: uiTokens.space.lg,
            paddingBottom: uiTokens.space.xxl,
            gap: uiTokens.space.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: uiTokens.space.sm }}>
            <Text
              accessibilityRole="header"
              style={{
                color: palette.text,
                fontSize: uiTokens.type.heading,
                fontWeight: '700',
              }}
            >
              {t('headline', 'Scan your original ticket')}
            </Text>
            <Text style={{ color: palette.muted, fontSize: uiTokens.type.body }}>
              {t('intro', 'Already bought a ticket? Scan its original event-ticket QR to request your HASHPASS pass.')}
            </Text>
          </View>

          <ActionButton
            mode={mode}
            label={t('scanAction', 'Scan ticket QR')}
            leadingIcon={<MaterialIcons name="qr-code-scanner" size={20} color={palette.onAccent} />}
            onPress={() => setScannerVisible(true)}
          />

          <Surface mode={mode} style={{ width: '100%', gap: uiTokens.space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md }}>
              <View
                accessible={false}
                style={{
                  width: uiTokens.control.minHeight,
                  height: uiTokens.control.minHeight,
                  borderRadius: uiTokens.radius.media,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: palette.accentSoft,
                  flexShrink: 0,
                }}
              >
                <MaterialIcons name="qr-code-scanner" size={24} color={palette.accent} />
              </View>
              <Text style={{ color: palette.text, fontSize: uiTokens.type.label, fontWeight: '700', flex: 1 }}>
                {t('stepsHeading', 'How it works')}
              </Text>
            </View>

            <View style={{ gap: uiTokens.space.lg }}>
              {steps.map((step, index) => (
                <View key={step.title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: uiTokens.space.md }}>
                  <View
                    accessible={false}
                    style={{
                      width: uiTokens.control.badgeHeight,
                      height: uiTokens.control.badgeHeight,
                      borderRadius: uiTokens.radius.circle,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: palette.accentSoft,
                      flexShrink: 0,
                    }}
                  >
                    <Text style={{ color: palette.accent, fontSize: uiTokens.type.caption, fontWeight: '700' }}>
                      {index + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: uiTokens.space.xs }}>
                    <Text style={{ color: palette.text, fontSize: uiTokens.type.label, fontWeight: '700' }}>
                      {step.title}
                    </Text>
                    <Text style={{ color: palette.muted, fontSize: uiTokens.type.body }}>
                      {step.body}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Surface>

          <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption }}>
            {t('singleClaimNote', 'Only scan a ticket you purchased. Each original ticket can be claimed once.')}
          </Text>

        </ScrollView>
      </SafeAreaView>

      <QRScanner
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
        title={t('scannerTitle', 'Scan your original ticket')}
        description={t('scannerDescription', 'Scan the QR code from your ticket email or ticket app.')}
      />
    </>
  );
}
