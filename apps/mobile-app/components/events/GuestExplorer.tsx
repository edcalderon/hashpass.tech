import HashpassBrand from "../HashpassBrand";
import { LogInIcon } from "../icons/SettingsIcons";
import QuickSettingsPanel from "../QuickSettingsPanel";
import React, { useCallback, useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActionButton, Badge, ModalBackdrop } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../hooks/useAuth";
import { useTranslation } from "../../i18n/i18n";
import { useEvent } from "../../contexts/EventContext";
import { getAvailableEvents, type EventInfo } from "../../lib/event-detector";
import { filterPublicEvents } from "../../lib/public-events";
import Explorer from "../explorer/Explorer";
import EventShowcase from "./EventShowcase";
import AuthScreen from "../../app/(shared)/auth";

/** Public discovery uses the same Explorer as the signed-in application. */
export default function GuestExplorer() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId?: string }>();
  const { isDark } = useTheme();
  const { isLoggedIn, dbUserId } = useAuth();
  const { t } = useTranslation("publicEvents");
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEvent();
  const [, refresh] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<EventInfo | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [guestHelpOpen, setGuestHelpOpen] = useState(false);
  const guestDescription = t("guestDescription", "You’re browsing a simplified version of HASHPASS. Register and download the app to access the full experience, including your passes, saved events and community features.");
  const requestAuth = useCallback(() => setAuthOpen(true), []);
  const closeAuth = useCallback(() => setAuthOpen(false), []);
  const events: EventInfo[] = filterPublicEvents(getAvailableEvents());
  const routeEventId =
    typeof params.eventId === "string" ? params.eventId : undefined;
  const routeEvent = events.find((event) => event.id === routeEventId) || null;
  useEffect(() => {
    setSelectedEvent(routeEvent);
  }, [routeEventId, routeEvent?.id]);
  const selectEvent = (event: EventInfo | null) => {
    setSelectedEvent(event);
    router.setParams({ eventId: event?.id });
  };
  const palette = uiPalette(isDark);
  const mode = isDark ? "dark" : "light";
  const wide = width >= 1000;
  const compactHeader = width < 390;
  const accountAction = (route: string) => {
    if (isLoggedIn) router.push(route as never);
    else requestAuth();
  };
  const nav = [
    { label: t("navEvents", "Explore events"), route: null },
    { label: t("navPasses", "My passes"), route: "/dashboard/explore" },
    { label: t("navWallet", "Wallet"), route: "/dashboard/wallet" },
    { label: t("navCommunity", "Community"), route: "/dashboard/explore" },
  ];
  const navigation = (
    <View style={[styles.navigation, !wide && styles.mobileNavigation]}>
      {nav.map((item) => (
        <ActionButton
          key={item.label}
          mode={mode}
          variant={item.route ? "ghost" : "secondary"}
          label={item.label}
          onPress={() =>
            item.route ? accountAction(item.route) : selectEvent(null)
          }
        />
      ))}
    </View>
  );

  return (
    <View
      style={[
        styles.page,
        {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          backgroundColor: palette.canvas,
        },
      ]}
    >
      <View
        accessibilityElementsHidden={authOpen}
        importantForAccessibility={authOpen ? "no-hide-descendants" : "auto"}
        style={[styles.topbar, { borderColor: palette.border }]}
      >
        <HashpassBrand onPress={() => router.push("/home")} />
        <View style={styles.account}>
          {!isLoggedIn && width >= 1000 && (
            <View onPointerLeave={() => setGuestHelpOpen(false)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("guest", "Guest mode")}
                accessibilityHint={guestDescription}
                accessibilityState={{ expanded: guestHelpOpen }}
                onHoverIn={() => setGuestHelpOpen(true)}
                onFocus={() => setGuestHelpOpen(true)}
                onBlur={() => setGuestHelpOpen(false)}
                onPress={() => setGuestHelpOpen(true)}
                {...(Platform.OS === "web" ? {
                  onKeyDown: (event: { key: string }) => {
                    if (event.key === "Escape") setGuestHelpOpen(false);
                  },
                  "aria-describedby": guestHelpOpen ? "guest-mode-description" : undefined,
                } : {})}
                style={{ minHeight: uiTokens.control.compactHeight, justifyContent: "center" }}
              >
                <Badge mode={mode}>{t("guest", "Guest mode")}</Badge>
              </Pressable>
              {guestHelpOpen && (
                <View
                  nativeID="guest-mode-description"
                  {...(Platform.OS === "web" ? { role: "tooltip" as const } : {})}
                  style={[styles.guestTooltip, { backgroundColor: palette.surface, borderColor: palette.border }]}
                >
                  <Text style={{ color: palette.text, fontSize: uiTokens.type.label, lineHeight: 22 }}>
                    {guestDescription}
                  </Text>
                </View>
              )}
            </View>
          )}
          <QuickSettingsPanel inline showSignIn={false} forceVisible />
          <ActionButton
              mode={mode}
              variant="primary"
              accessibilityLabel={
                isLoggedIn
                  ? t("openApp", "Open app")
                  : t("join", "Join HASHPASS")
              }
              leadingIcon={<LogInIcon size={18} color={palette.onAccent} />}
              style={{
                paddingHorizontal: compactHeader ? uiTokens.space.md : uiTokens.space.xl,
                flexShrink: 1,
              }}
              label={
                isLoggedIn
                  ? t("openApp", "Open app")
                  : compactHeader
                    ? t("joinShort", "Join")
                    : t("join", "Join HASHPASS")
              }
              onPress={() => accountAction("/dashboard/explore")}
          />
        </View>
      </View>
      <View
        accessibilityElementsHidden={authOpen}
        importantForAccessibility={authOpen ? "no-hide-descendants" : "auto"}
        style={styles.body}
      >
        {wide && (
          <View style={[styles.sidebar, { borderColor: palette.border }]}>
            {navigation}
            <Text style={[styles.note, { color: palette.muted }]}>
              {t(
                "guestHint",
                "Browse freely. Join to save events, manage passes and connect.",
              )}
            </Text>
          </View>
        )}
        <View style={styles.main}>
          {!wide && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ flexGrow: 0, flexShrink: 0 }}
              contentContainerStyle={{ alignItems: "center" }}
            >
              {navigation}
            </ScrollView>
          )}
          <Explorer
            events={events}
            selectedEvent={selectedEvent}
            onSelectEvent={selectEvent}
            onResetSelection={() => selectEvent(null)}
            isLoggedIn={isLoggedIn}
            dbUserId={dbUserId}
            isGlobalExplorer
            onRefreshEvents={() => refresh((value) => value + 1)}
            onAuthRequired={requestAuth}
            showcase={
              <EventShowcase
                active={!authOpen}
                includePast={!!selectedEvent}
                events={selectedEvent ? [selectedEvent] : events}
                onSelectEvent={selectEvent}
              />
            }
          />
        </View>
      </View>
      <Modal
        visible={authOpen}
        transparent
        animationType="fade"
        onRequestClose={closeAuth}
      >
        <ModalBackdrop mode={mode}>
          <View
            accessibilityViewIsModal
            style={[
              styles.dialog,
              {
                height: Math.min(height - insets.top - insets.bottom - 32, 560),
              },
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <View
              style={[styles.dialogHeader, { borderColor: palette.border }]}
            >
              <Text
                accessibilityRole="header"
                style={[styles.dialogTitle, { color: palette.text }]}
              >
                {t("authTitle", "Join to use the full app")}
              </Text>
              <ActionButton
                mode={mode}
                variant="ghost"
                label={t("close", "Close")}
                onPress={closeAuth}
              />
            </View>
            <Text style={[styles.dialogHint, { color: palette.muted }]}>
              {t(
                "authHint",
                "Create an account or sign in with a verification code. Your event search stays here.",
              )}
            </Text>
            {authOpen && (
              <AuthScreen
                embedded
                onAuthenticated={closeAuth}
                onDismiss={closeAuth}
              />
            )}
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0 },
  topbar: {
    zIndex: 20,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTokens.space.md,
  },
  guestTooltip: {
    position: "absolute",
    top: "100%",
    left: 0,
    width: 300,
    padding: uiTokens.space.lg,
    borderWidth: uiTokens.control.borderWidth,
    borderRadius: uiTokens.radius.input,
    boxShadow: uiTokens.effects.dialogShadow,
    zIndex: 30,
  },
  account: {
    flexDirection: "row",
    gap: uiTokens.space.sm,
    alignItems: "center",
    flexShrink: 1,
  },
  body: { flex: 1, flexDirection: "row", minHeight: 0 },
  sidebar: { width: 216, padding: 16, borderRightWidth: 1, gap: 24 },
  navigation: { gap: 8 },
  mobileNavigation: {
    flexDirection: "row",
    flexWrap: "nowrap",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: uiTokens.space.sm,
  },
  main: { flex: 1, minWidth: 0, minHeight: 0 },
  note: { fontSize: 14, lineHeight: 22 },
  dialog: {
    width: "100%",
    maxWidth: 560,
    maxHeight: 560,
    boxShadow: uiTokens.effects.dialogShadow,
    borderWidth: 1,
    borderRadius: uiTokens.radius.card,
    overflow: "hidden",
  },
  dialogHeader: {
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    gap: 8,
  },
  dialogTitle: { fontSize: 20, fontWeight: "700", flex: 1 },
  dialogHint: { padding: 16, fontSize: 14, lineHeight: 22 },
});
