import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, ActivityIndicator, useWindowDimensions, Platform, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { useRouter } from 'expo-router';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
import EventBanner from '../../../components/EventBanner';
import { Surface, ActionButton, ModalBackdrop, HoverText } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { MaterialIcons } from '@expo/vector-icons';

// The web-only <iframe> below is a raw DOM element, not an RN component, so
// its style is real CSS (e.g. `border: 'none'`) and must stay out of
// StyleSheet.create -- RN's ViewStyle/TextStyle/ImageStyle union has no
// `border` shorthand property, so mixing it into the shared RN styles object
// fails typechecking even though it's only ever rendered on web.
const webIframeStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  border: 'none',
};

// Best-effort hostname for the disclaimer copy / dialog header. ticketUrl is
// always a real https URL from config today, but event data isn't schema
// validated at this layer -- fall back to null rather than let a malformed
// value throw and blank the whole screen.
const getHostname = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

// BSL events use external ticketing. Shows a purchase button that opens a floating
// dialog with the ticketing iframe/WebView -- styled and labeled as a distinct,
// externally-operated page (not another in-app screen) so it's clear tickets are
// sold and fulfilled directly by the event organizer, not HASHPASS.
export default function TicketsScreen() {
  const { event } = useEvent();
  const { isDark } = useTheme();
  const router = useRouter();
  const { width: viewportWidth } = useWindowDimensions();
  const isWide = viewportWidth >= 960;
  const palette = uiPalette(isDark);
  const styles = getStyles(palette, isWide, viewportWidth);

  const eventId = event?.id || 'colombia2026';
  const eventTitle = event?.title || 'Event';
  const eventDate = event?.eventDateString || event?.subtitle || 'Date TBA';

  const [showTicketModal, setShowTicketModal] = useState(false);

  // BSL ticket purchase URL
  const ticketUrl = eventId === 'colombia2026'
    ? 'https://bsl.blckchn.xyz/e/bsl-colombia-2026#tickets'
    : event?.website
      ? `${event.website.replace(/\/$/, '')}/tickets/`
      : `https://bsl.blckchn.xyz/e/${eventId}#tickets`;
  const ticketHostname = getHostname(ticketUrl);

  // Opens the real external ticket page directly -- on web as a proper new
  // tab (target="_blank" equivalent) rather than only inside the in-app
  // iframe, since payment/ticketing providers commonly refuse to be framed
  // at all (X-Frame-Options/CSP frame-ancestors), and the disclaimer copy
  // ("you're leaving the HASHPASS app") implies a real navigation, not just
  // an embed.
  const openTicketLink = () => {
    if (Platform.OS === 'web') {
      window.open(ticketUrl, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(ticketUrl).catch(() => null);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <EventBanner
          title={eventTitle}
          subtitle="Get your tickets"
          date={eventDate}
        />

        <View style={styles.content}>
          <Surface mode={isDark ? 'dark' : 'light'} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconCircle}>
                <MaterialIcons name="confirmation-number" size={22} color={palette.accent} />
              </View>
              <Text style={styles.cardTitle}>Event Tickets</Text>
            </View>

            <Text style={styles.description}>
              Purchase your tickets to attend {eventTitle}. Secure your spot for networking sessions, keynotes, panels, and exclusive access to the blockchain community.
            </Text>

            <View style={styles.ticketInfo}>
              <View style={styles.infoRow}>
                <MaterialIcons name="event" size={20} color={palette.muted} />
                <Text style={styles.infoText}>{eventDate}</Text>
              </View>
              {event?.tour?.venue && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="business" size={20} color={palette.muted} />
                  <Text style={styles.infoText}>{event.tour.venue}</Text>
                </View>
              )}
              {event?.tour?.city && event?.tour?.country && (
                <View style={styles.infoRow}>
                  <MaterialIcons name="location-on" size={20} color={palette.muted} />
                  <Text style={styles.infoText}>
                    {event.tour.city}, {event.tour.country}
                  </Text>
                </View>
              )}
            </View>

            {ticketHostname && (
              <TouchableOpacity
                style={styles.hostnameRow}
                onPress={openTicketLink}
                accessibilityRole="link"
                accessibilityLabel={`Tickets provided by ${ticketHostname}, opens in a new tab`}
              >
                <MaterialIcons name="public" size={14} color={palette.accent} />
                <Text style={styles.hostnameLinkText}>Tickets provided by {ticketHostname}</Text>
                <MaterialIcons name="open-in-new" size={12} color={palette.accent} />
              </TouchableOpacity>
            )}

            <ActionButton
              mode={isDark ? 'dark' : 'light'}
              label="Purchase Tickets"
              onPress={() => setShowTicketModal(true)}
              trailingIcon={
                <MaterialIcons name="open-in-new" size={18} color={palette.onAccent} />
              }
            />

            {/* Responsibility disclaimer -- ticket purchase happens on the
                organizer's own site; HASHPASS only links to it. */}
            <View style={styles.disclaimerRow}>
              <MaterialIcons name="info-outline" size={14} color={palette.muted} />
              <Text style={styles.disclaimerText}>
                You'll be redirected to an external site operated directly by the event organizer. HASHPASS isn't involved in payment, delivery, or support for this purchase.
              </Text>
            </View>
          </Surface>

          <Surface mode={isDark ? 'dark' : 'light'} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconCircle}>
                <MaterialIcons name="info" size={22} color={palette.accent} />
              </View>
              <Text style={styles.cardTitle}>Need Help?</Text>
            </View>
            <Text style={styles.description}>
              If you have questions about tickets, pricing, or group discounts, please contact our support team.
            </Text>
            <ActionButton
              mode={isDark ? 'dark' : 'light'}
              label="Contact Support"
              variant="secondary"
              onPress={() => router.push('/(shared)/support')}
            />
          </Surface>
        </View>
      </ScrollView>

      {/* Ticket Purchase Dialog -- a floating, card-style overlay (not an
          edge-to-edge in-app sheet) so it visually reads as a distinct,
          externally-hosted page rather than another app screen. */}
      <Modal
        visible={showTicketModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTicketModal(false)}
        statusBarTranslucent
      >
        <ModalBackdrop mode={isDark ? 'dark' : 'light'}>
          <View accessibilityViewIsModal style={styles.dialogCard}>
            <View style={styles.dialogHeader}>
              <TouchableOpacity
                style={styles.dialogHeaderTap}
                onPress={openTicketLink}
                accessibilityRole="link"
                accessibilityLabel={`Open ${ticketHostname || 'the ticket site'} in a new tab`}
              >
                <View style={styles.dialogHeaderIcon}>
                  <MaterialIcons name="open-in-new" size={18} color={palette.accent} />
                </View>
                <View style={styles.dialogHeaderCopy}>
                  <HoverText mode={isDark ? 'dark' : 'light'} style={styles.dialogHeaderTitle} numberOfLines={1}>
                    {ticketHostname || 'External ticketing'}
                  </HoverText>
                  <HoverText mode={isDark ? 'dark' : 'light'} style={styles.dialogHeaderSubtitle} numberOfLines={1}>
                    Managed directly by the event organizer
                  </HoverText>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowTicketModal(false)}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Close ticket modal"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="close" size={22} color={palette.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.dialogNotice}>
              <MaterialIcons name="info-outline" size={16} color={palette.muted} />
              <Text style={styles.dialogNoticeText}>
                You're leaving the HASHPASS app. This page is hosted and operated by the event organizer -- HASHPASS doesn't process payment or handle support here.
              </Text>
            </View>

            <View style={styles.dialogBody}>
              {Platform.OS === 'web' ? (
                <iframe
                  src={ticketUrl}
                  style={webIframeStyle}
                  title="Ticket purchase"
                  allow="payment"
                />
              ) : (
                <WebView
                  source={{ uri: ticketUrl }}
                  style={styles.webView}
                  startInLoadingState
                  renderLoading={() => (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color={palette.accent} />
                      <Text style={styles.loadingText}>Loading tickets...</Text>
                    </View>
                  )}
                  javaScriptEnabled
                  domStorageEnabled
                  allowsInlineMediaPlayback
                  mediaPlaybackRequiresUserAction={false}
                />
              )}
            </View>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}

const getStyles = (palette: ReturnType<typeof uiPalette>, isWide: boolean, viewportWidth: number) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.canvas,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: uiTokens.space.xl,
    },
    content: {
      paddingHorizontal: uiTokens.space.lg,
      paddingTop: uiTokens.space.lg,
      gap: uiTokens.space.lg,
      maxWidth: isWide ? 720 : '100%',
      alignSelf: 'center',
      width: '100%',
    },
    card: {
      borderRadius: uiTokens.radius.card,
      padding: uiTokens.space.xl,
      gap: uiTokens.space.md,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.md,
      marginBottom: uiTokens.space.xs,
    },
    cardIconCircle: {
      width: 44,
      height: 44,
      borderRadius: uiTokens.radius.circle,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.border,
    },
    cardTitle: {
      fontSize: uiTokens.type.title,
      fontWeight: '700',
      color: palette.text,
      flex: 1,
    },
    description: {
      fontSize: uiTokens.type.body,
      lineHeight: 24,
      color: palette.muted,
    },
    ticketInfo: {
      gap: uiTokens.space.sm,
      paddingVertical: uiTokens.space.md,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: palette.border,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.sm,
    },
    infoText: {
      fontSize: uiTokens.type.body,
      color: palette.text,
      flex: 1,
    },
    hostnameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.xs,
      alignSelf: 'flex-start',
    },
    hostnameLinkText: {
      fontSize: uiTokens.type.caption,
      color: palette.accent,
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    disclaimerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: uiTokens.space.xs,
      paddingTop: uiTokens.space.xs,
    },
    disclaimerText: {
      flex: 1,
      fontSize: uiTokens.type.caption,
      lineHeight: 17,
      color: palette.muted,
    },
    // Floating ticket dialog -- deliberately a centered, all-corners-rounded
    // card (not an edge-to-edge sheet) so it reads as a distinct external
    // page rather than another in-app screen.
    dialogCard: {
      width: '100%',
      maxWidth: 640,
      height: '82%',
      maxHeight: 760,
      borderRadius: uiTokens.radius.card,
      overflow: 'hidden',
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.border,
      boxShadow: uiTokens.effects.dialogShadow,
    },
    dialogHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.sm,
      paddingHorizontal: uiTokens.space.lg,
      paddingVertical: uiTokens.space.md,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
      backgroundColor: palette.raised,
    },
    dialogHeaderTap: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: uiTokens.space.sm,
    },
    dialogHeaderIcon: {
      width: 32,
      height: 32,
      borderRadius: uiTokens.radius.circle,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: palette.accentSoft,
    },
    dialogHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 1,
    },
    dialogHeaderTitle: {
      fontSize: uiTokens.type.label,
      fontWeight: '700',
      color: palette.text,
    },
    dialogHeaderSubtitle: {
      fontSize: 11,
      color: palette.muted,
    },
    closeButton: {
      padding: uiTokens.space.xs,
    },
    dialogNotice: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: uiTokens.space.sm,
      paddingHorizontal: uiTokens.space.lg,
      paddingVertical: uiTokens.space.sm,
      backgroundColor: palette.canvas,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    dialogNoticeText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
      color: palette.muted,
    },
    dialogBody: {
      flex: 1,
      minHeight: 0,
      backgroundColor: palette.canvas,
    },
    webView: {
      flex: 1,
    },
    loadingContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: palette.canvas,
    },
    loadingText: {
      marginTop: uiTokens.space.md,
      fontSize: uiTokens.type.body,
      color: palette.muted,
    },
  });
