import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialIcons } from "../lib/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import {
  EventPassTier,
  passSystemService,
  PassInfo,
  PassRequestLimits,
  PassType,
  MEETING_REQUEST_LIMIT_RESET_COST,
} from "@/lib/pass-system";
import { resolveActiveEventId } from "@/lib/event-path";
import { useTranslation } from "@/i18n/i18n";
import * as Sentry from "@sentry/react-native";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { ActionButton, Badge, Surface } from "@hashpass/ui/primitives";
import PassesWallet from "./passes/PassesWallet";
import type { PassTimelineFilter, PassTypeFilter } from "../lib/pass-wallet";

interface PassesDisplayProps {
  // Display mode
  mode?: "dashboard" | "speaker";

  // Speaker-specific props
  speakerId?: string;
  boostAmount?: number;
  showRequestButton?: boolean;
  onRequestPress?: () => void;
  existingRequest?: { id: string; status: string } | null;
  onExistingRequestPress?: () => void;
  requestStatusLoading?: boolean;

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
  walletLayout?: "stacked" | "plain";

  // Explorer can drive the wallet from its single discovery search/filter
  // surface rather than rendering a second pass-specific one below it.
  explorerFilters?: {
    query?: string;
    eventIds?: string[];
    timeline?: PassTimelineFilter;
    passType?: PassTypeFilter;
  };
  hideWalletControls?: boolean;
  hideWalletReload?: boolean;
  /** A verified invite route can redeem an event-scoped Business pass. */
  businessInviteCode?: string;
  onPassesLoaded?: (passes: PassInfo[]) => void;
  onPassesLoadingChange?: (isLoading: boolean) => void;

  // Refresh trigger
  refreshTrigger?: number;
}

export const formatEventPassTierPrice = (tier?: EventPassTier): string => {
  if (!tier) return "";
  if (tier.price_label) return tier.price_label;
  if (tier.price_cents === null) return "";

  const currency = tier.currency || "USD";
  const fractionDigits = tier.price_cents % 100 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(tier.price_cents / 100);
  } catch {
    return `${currency} ${(tier.price_cents / 100).toFixed(fractionDigits)}`;
  }
};

function PassesDisplayInner({
  mode = "dashboard",
  speakerId,
  boostAmount = 0,
  showRequestButton = false,
  onRequestPress,
  existingRequest,
  onExistingRequestPress,
  requestStatusLoading = false,
  eventId,
  onPassInfoLoaded,
  onRequestLimitsLoaded,
  showPassComparison = false,
  refreshTrigger,
}: PassesDisplayProps) {
  const { t: translate } = useTranslation("passes");
  const { colors, isDark } = useTheme();
  // The speaker-mode card uses the shared system palette so it reads as part of
  // the dashboard: neutral surfaces, one accent, amber reserved for VIP.
  const uiMode = isDark ? "dark" : "light";
  const palette = uiPalette(uiMode);
  const { dbUserId, retryDatabaseSession } = useAuth();
  const router = useRouter();
  const [passInfo, setPassInfo] = useState<PassInfo | null>(null);
  const [requestLimits, setRequestLimits] = useState<PassRequestLimits | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [resettingLimits, setResettingLimits] = useState(false);
  const [showComparison, setShowComparison] = useState(showPassComparison);
  const [eventPassTiers, setEventPassTiers] = useState<EventPassTier[]>([]);
  // The whole tier overview is one collapsed row; opening it lists the tiers.
  const [tiersOpen, setTiersOpen] = useState(false);

  // Helper function to translate
  // Note: useTranslation('passes') already sets the namespace, so remove 'passes.' prefix if present
  const t = (translation: { id: string; message: string }) => {
    try {
      // Remove 'passes.' prefix if present since useTranslation('passes') already adds it
      const key = translation.id.startsWith("passes.")
        ? translation.id.replace(/^passes\./, "")
        : translation.id;
      const translated = translate(key, {});
      // If translation returns the key itself (not found), use the fallback message
      if (
        !translated ||
        translated === key ||
        translated.startsWith("passes.")
      ) {
        return translation.message;
      }
      return translated;
    } catch {
      return translation.message;
    }
  };

  // Demo mode check
  const isDemoMode = process.env.NODE_ENV === "development";

  useEffect(() => {
    loadPassInfo();
  }, [dbUserId, refreshTrigger, eventId]);

  // Load the live catalog even before a pass exists. This keeps the
  // development/demo comparison in step with the event administrator's tier
  // configuration instead of falling back to static prices.
  const passEventId = passInfo?.event_id || resolveActiveEventId(eventId);

  useEffect(() => {
    if (!passEventId) return;
    let isCurrent = true;

    void passSystemService
      .getEventPassTiers(passEventId)
      .then((tiers: EventPassTier[]) => {
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
    for (const tier of eventPassTiers) {
      if (tier.price_cents === null) continue;
      const currency = tier.currency || "USD";
      const fractionDigits = tier.price_cents % 100 === 0 ? 0 : 2;
      const formatterKey = `${currency}:${fractionDigits}`;
      if (formatters.has(formatterKey)) continue;
      try {
        formatters.set(
          formatterKey,
          new Intl.NumberFormat(undefined, {
            style: "currency",
            currency,
            minimumFractionDigits: fractionDigits,
            maximumFractionDigits: fractionDigits,
          }),
        );
      } catch {
        // Invalid legacy currency values use the plain-text fallback below.
      }
    }
    return formatters;
  }, [eventPassTiers]);

  const getTier = (passType: PassType): EventPassTier | undefined =>
    tiersByType.get(passType);
  const getTierPrice = (passType: PassType) => {
    const tier = getTier(passType);
    if (!tier) return "";
    if (tier.price_label) return tier.price_label;
    if (tier.price_cents === null) return "";
    const currency = tier.currency || "USD";
    const fractionDigits = tier.price_cents % 100 === 0 ? 0 : 2;
    return (
      currencyFormatters
        .get(`${currency}:${fractionDigits}`)
        ?.format(tier.price_cents / 100) ?? formatEventPassTierPrice(tier)
    );
  };

  // Tier overview for the speaker view: what each pass allows, never what it
  // costs (prices change dynamically and live in the ticket modal). Collapsed
  // to a single row by default; opening it lists the tiers compactly with one
  // shared "Acquire ticket" link to the ticket purchase.
  const renderTierShowcase = () => {
    const tierTypes: PassType[] = ["general", "business", "vip"];
    return (
      <View
        style={{
          marginBottom: uiTokens.space.lg,
          backgroundColor: palette.canvas,
          borderRadius: uiTokens.radius.input,
          borderWidth: uiTokens.control.borderWidth,
          borderColor: palette.border,
          overflow: "hidden",
        }}
        testID="pass-tier-showcase"
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Pass tiers"
          accessibilityState={{ expanded: tiersOpen }}
          onPress={() => setTiersOpen((open) => !open)}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            minHeight: uiTokens.control.compactHeight,
            paddingHorizontal: uiTokens.space.lg,
          }}
        >
          <Text
            style={{
              fontSize: uiTokens.type.label,
              fontWeight: "600",
              color: palette.text,
            }}
          >
            {t({ id: "passes.tiersTitle", message: "Pass tiers" })}
          </Text>
          <MaterialIcons
            name={tiersOpen ? "expand-less" : "expand-more"}
            size={24}
            color={palette.muted}
          />
        </TouchableOpacity>
        {tiersOpen && (
          <View
            style={{
              paddingHorizontal: uiTokens.space.lg,
              paddingBottom: uiTokens.space.lg,
            }}
          >
            {tierTypes.map((passType) => {
              const tier = getTier(passType);
              const isCurrent = passInfo?.pass_type === passType;
              return (
                <View
                  key={passType}
                  testID={`pass-tier-${passType}`}
                  style={{
                    paddingVertical: uiTokens.space.md,
                    borderTopWidth: uiTokens.control.borderWidth,
                    borderTopColor: palette.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: uiTokens.type.label,
                        fontWeight: isCurrent ? "700" : "600",
                        color: palette.text,
                      }}
                    >
                      {getPassTypeDisplayName(passType)}
                    </Text>
                    {isCurrent && (
                      <Badge mode={uiMode} compact>
                        {t({ id: "passes.yourPass", message: "Your pass" })}
                      </Badge>
                    )}
                  </View>
                  {tier && (
                    <Text
                      style={{
                        fontSize: uiTokens.type.caption,
                        color: palette.muted,
                        marginTop: uiTokens.space.xs,
                      }}
                    >
                      {`${tier.max_meeting_requests} ${t({
                        id: "passes.tierMeetingRequests",
                        message: "meeting requests",
                      })} · ${tier.max_boost_amount} ${t({
                        id: "passes.tierBoostPoints",
                        message: "boost points",
                      })}`}
                    </Text>
                  )}
                </View>
              );
            })}
            <ActionButton
              mode={uiMode}
              variant="secondary"
              label={t({ id: "passes.acquireTicket", message: "Acquire ticket" })}
              accessibilityLabel="Acquire ticket"
              accessibilityRole="link"
              onPress={openEventTickets}
              trailingIcon={
                <MaterialIcons name="arrow-forward" size={20} color={palette.accent} />
              }
              style={{ alignSelf: "stretch", marginTop: uiTokens.space.xs }}
            />
          </View>
        )}
      </View>
    );
  };

  const translatePassDetail = (detail: string) => {
    const translations: Record<string, { id: string; message: string }> = {
      "Access to all conference sessions": {
        id: "passes.passPerks.features.allSessions",
        message: "Access to all conference sessions",
      },
      "Access to main event areas": {
        id: "passes.passPerks.features.mainAreas",
        message: "Access to main event areas",
      },
      "Networking & B2B sessions": {
        id: "passes.passPerks.features.networkingSessions",
        message: "Networking & B2B sessions",
      },
      "Business lounge access": {
        id: "passes.passPerks.features.businessLounge",
        message: "Business lounge access",
      },
      "VIP networking with speakers": {
        id: "passes.passPerks.features.vipNetworking",
        message: "VIP networking with speakers",
      },
      "VIP lounge access": {
        id: "passes.passPerks.features.vipLounge",
        message: "VIP lounge access",
      },
      "Priority seating": {
        id: "passes.passPerks.features.prioritySeating",
        message: "Priority seating",
      },
      "Networking Tools": {
        id: "passes.passPerks.features.networkingTools",
        message: "Networking tools",
      },
      "Business Support": {
        id: "passes.passPerks.features.businessSupport",
        message: "Business support",
      },
      "Concierge Service": {
        id: "passes.passPerks.features.conciergeService",
        message: "Concierge service",
      },
      "Premium Swag": {
        id: "passes.passPerks.features.premiumSwag",
        message: "Premium swag",
      },
      "Official closing party": {
        id: "passes.passPerks.features.closingParty",
        message: "Official closing party",
      },
    };
    const translation = translations[detail];
    return translation ? t(translation) : detail;
  };

  useEffect(() => {
    if (speakerId && dbUserId) {
      loadRequestLimits();
    }
  }, [speakerId, dbUserId, boostAmount, eventId, refreshTrigger]);

  const loadPassInfo = async () => {
    if (!dbUserId) {
      // Native Better Auth sign-in completes just before its Supabase session
      // bridge is persisted. Clear any prior identity's pass while the bridge
      // reconnects so an expired/sign-out session can never retain its wallet.
      setPassInfo(null);
      setLoading(true);
      try {
        await retryDatabaseSession?.();
      } finally {
        setLoading(false);
        setInitialLoad(false);
      }
      return;
    }

    setLoading(true);
    try {
      const info = await passSystemService.getUserPassInfo(dbUserId, eventId);
      setPassInfo(info);
      onPassInfoLoaded?.(info);
    } catch (error) {
      console.error("Error loading pass info:", error);
      setPassInfo(null);
    } finally {
      setLoading(false);
      // Add a small delay to prevent flash of "No Pass Found"
      setTimeout(() => {
        setInitialLoad(false);
      }, 300);
    }
  };

  const openEventTickets = () => {
    const targetEventId = eventId || passInfo?.event_id || resolveActiveEventId();
    router.push({
      pathname: "/events/[eventSlug]/tickets",
      params: {
        eventSlug: targetEventId,
        openTicketModal: "true",
      },
    } as any);
  };

  const loadRequestLimits = async () => {
    if (!dbUserId || !speakerId) return;

    try {
      const limits = await passSystemService.canMakeMeetingRequest(
        dbUserId,
        speakerId,
        boostAmount,
        eventId,
      );
      setRequestLimits(limits);
      onRequestLimitsLoaded?.(limits);
    } catch (error) {
      console.error("Error loading request limits:", error);
      // Set error state using passInfo if available, otherwise use defaults
      if (passInfo) {
        setRequestLimits({
          can_request: false,
          canSendRequest: false,
          reason: "Error checking limits",
          pass_type: passInfo.pass_type,
          remaining_requests: passInfo.remaining_requests || 0,
          remaining_boost: passInfo.remaining_boost || 0,
        });
      } else {
        setRequestLimits({
          can_request: false,
          canSendRequest: false,
          reason: "Error checking limits",
          pass_type: null,
          remaining_requests: 0,
          remaining_boost: 0,
        });
      }
    }
  };

  const hasExistingRequest = Boolean(existingRequest);

  const canResetRequestLimits = Boolean(
    passInfo &&
      requestLimits &&
      !requestLimits.canSendRequest &&
      !hasExistingRequest &&
      requestLimits.reason === "no_requests_remaining" &&
      requestLimits.remaining_boost >= MEETING_REQUEST_LIMIT_RESET_COST,
  );

  const resetRequestLimits = () => {
    if (!dbUserId || !eventId || !canResetRequestLimits || resettingLimits) {
      return;
    }

    Alert.alert(
      t({
        id: "passes.resetMeetingRequestLimitTitle",
        message: "Reset meeting request limit?",
      }),
      t({
        id: "passes.resetMeetingRequestLimitDescription",
        message: `Spend ${MEETING_REQUEST_LIMIT_RESET_COST} Boost points to restore your meeting requests.`,
      }),
      [
        {
          text: t({ id: "passes.cancel", message: "Cancel" }),
          style: "cancel",
        },
        {
          text: t({
            id: "passes.resetMeetingRequestLimit",
            message: "Reset limit",
          }),
          onPress: async () => {
            setResettingLimits(true);
            try {
              await passSystemService.resetMeetingRequestLimits(dbUserId, eventId);
              await loadPassInfo();
              await loadRequestLimits();
              Alert.alert(
                t({
                  id: "passes.resetMeetingRequestLimitSuccessTitle",
                  message: "Limit reset",
                }),
                t({
                  id: "passes.resetMeetingRequestLimitSuccessDescription",
                  message: "Your meeting requests are available again.",
                }),
              );
            } catch (error) {
              console.error("Error resetting meeting request limits:", error);
              Alert.alert(
                t({ id: "passes.alert.errorTitle", message: "Unable to reset limit" }),
                error instanceof Error ? error.message : t({
                  id: "passes.resetMeetingRequestLimitFailure",
                  message: "Please try again.",
                }),
              );
            } finally {
              setResettingLimits(false);
            }
          },
        },
      ],
    );
  };

  const createDefaultPass = async (
    passType: "general" | "business" | "vip" = "general",
  ) => {
    if (!dbUserId) return;

    try {
      const passId = await passSystemService.createDefaultPass(
        dbUserId,
        passType,
      );
      if (passId) {
        Alert.alert(translate("alert.createdTitle", {}), undefined, [
          { text: translate("alert.ok", {}), onPress: loadPassInfo },
        ]);
      }
    } catch (error) {
      console.error("Error creating pass:", error);
      Alert.alert(
        translate("alert.errorTitle", {}),
        translate("alert.createFail", {}),
      );
    }
  };

  const getPassTypeColor = (passType: string) => {
    return passSystemService.getPassTypeColor(passType as any);
  };

  const getPassTypeDisplayName = (passType: string) => {
    return passSystemService.getPassTypeDisplayName(passType as any);
  };

  const issuedPassNumber =
    typeof passInfo?.pass_number === "string"
      ? passInfo.pass_number.trim()
      : "";
  const passIdFallback =
    typeof passInfo?.pass_id === "string" ? passInfo.pass_id.trim() : "";
  // Never render a bare "Pass #" while a bridge or legacy record is missing
  // its issued number. A stable id-derived fallback remains copyable and lets
  // support identify the actual pass.
  const rawPassNumber =
    issuedPassNumber || passIdFallback || "Pass number unavailable";
  const displayPassNumber =
    rawPassNumber.length > 12
      ? `${rawPassNumber.slice(0, 6)}...${rawPassNumber.slice(-4)}`
      : rawPassNumber;

  const openPassDetails = () => {
    if (!passInfo?.pass_id) return;

    router.push({
      pathname: "/(shared)/dashboard/pass-details",
      params: {
        passId: passInfo.pass_id,
        eventId: passInfo.event_id || eventId || "",
      },
    } as any);
  };

  // The entitlement endpoint only reports that an active request exists; it
  // does not include its status. Never turn that incomplete hint into a
  // “pending” card—the speaker-detail request query is the source of truth.
  const isPendingExistingRequest =
    !existingRequest ||
    ["pending", "requested"].includes(existingRequest.status);

  // Speaker mode - show detailed pass info with request functionality.
  // Dashboard mode never reaches here: PassesDisplayBoundary routes it to
  // PassesWallet before PassesDisplayInner renders.
  if (loading || initialLoad) {
    // Mirrors the "no passes found" card below (icon-and-title row, then a
    // message paragraph) instead of a stacked spinner+label, so loading and
    // empty read as the same visual family within this component.
    return (
      <View
        style={{
          padding: 20,
          backgroundColor: colors.background.paper,
          borderRadius: 12,
          margin: 16,
          borderWidth: 1,
          borderColor: colors.divider,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <ActivityIndicator size="small" color={colors.primary} />
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: colors.text.primary,
              marginLeft: 8,
            }}
          >
            {t({
              id: "passes.loading",
              message: "Loading your pass information...",
            })}
          </Text>
        </View>
        <Text
          style={{
            color: colors.text.secondary,
            lineHeight: 20,
          }}
        >
          {t({
            id: "passes.loadingSubtitle",
            message: "This should only take a moment.",
          })}
        </Text>
      </View>
    );
  }

  if (!passInfo) {
    return (
      <View
        style={{
          padding: 20,
          backgroundColor: colors.background.paper,
          borderRadius: 12,
          margin: 16,
          borderWidth: 1,
          borderColor: colors.divider,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <MaterialIcons
            name="confirmation-number"
            size={24}
            color={colors.text.secondary}
          />
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: colors.text.primary,
              marginLeft: 8,
            }}
          >
            {t({ id: "passes.noPassFound", message: "No passes found" })}
          </Text>
        </View>

        <Text
          style={{
            color: colors.text.secondary,
            marginBottom: 16,
            lineHeight: 20,
          }}
        >
          {isDemoMode
            ? t({
                id: "passes.noPassMessage.demo",
                message:
                  "You need a pass to request meetings with speakers. Without a pass, you cannot send meeting requests. Choose your pass type:",
              })
            : t({
                id: "passes.noPassMessage.production",
                message:
                  "You need a valid event pass to request meetings with speakers. Please purchase a pass to continue.",
              })}
        </Text>

        {mode === "speaker" ? (
          renderTierShowcase()
        ) : isDemoMode ? (
          <>
            {/* Pass Comparison Toggle - Demo Mode Only */}
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 12,
                backgroundColor: colors.background.default,
                borderRadius: 8,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: colors.divider,
              }}
              onPress={() => setShowComparison(!showComparison)}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.text.primary,
                }}
              >
                {t({
                  id: "passes.passTypes.all",
                  message: "All Pass Types & Pricing",
                })}{" "}
                {showComparison ? "(Open)" : "(Closed)"}
              </Text>
              <MaterialIcons
                name={
                  showComparison ? "keyboard-arrow-up" : "keyboard-arrow-down"
                }
                size={24}
                color={colors.text.secondary}
              />
            </TouchableOpacity>

            {/* Pass Comparison Content - Demo Mode Only */}
            {showComparison && (
              <View style={{ marginBottom: 16 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.text.secondary,
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  {t({
                    id: "passes.passComparison.compare",
                    message:
                      "Compare features and choose the right pass for your needs",
                  })}
                </Text>

                <View style={{ gap: 12 }}>
                  {/* General Pass */}
                  <TouchableOpacity
                    style={{
                      padding: 16,
                      backgroundColor: colors.background.default,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.divider,
                    }}
                    onPress={() => createDefaultPass("general")}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: colors.text.primary,
                        }}
                      >
                        {t({ id: "passes.type.general", message: "General" })}
                      </Text>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: "#34A853",
                        }}
                      >
                        {getTierPrice("general")}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.text.secondary,
                        marginBottom: 12,
                      }}
                    >
                      {t({
                        id: "passes.passPerks.general.conferences",
                        message: "Conferences only",
                      })}
                    </Text>
                    <View style={{ gap: 6 }}>
                      {passSystemService
                        .getPassPerks("general")
                        .features.map((feature: string, index: number) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <MaterialIcons
                              name="check-circle"
                              size={16}
                              color="#4CAF50"
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.text.secondary,
                                marginLeft: 8,
                              }}
                            >
                              {translatePassDetail(feature)}
                            </Text>
                          </View>
                        ))}
                      {passSystemService
                        .getPassPerks("general")
                        .perks.map((perk: string, index: number) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <MaterialIcons
                              name="check-circle"
                              size={16}
                              color="#4CAF50"
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.text.secondary,
                                marginLeft: 8,
                              }}
                            >
                              {translatePassDetail(perk)}
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
                      borderColor: colors.divider,
                    }}
                    accessibilityLabel="Purchase Business pass"
                    accessibilityRole="button"
                    onPress={openEventTickets}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: colors.text.primary,
                        }}
                      >
                        {t({ id: "passes.type.business", message: "Business" })}
                      </Text>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: "#007AFF",
                        }}
                      >
                        {getTierPrice("business")}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.text.secondary,
                        marginBottom: 12,
                      }}
                    >
                      {t({
                        id: "passes.passPerks.business.networking",
                        message: "+ Networking & B2B sessions",
                      })}
                    </Text>
                    <View style={{ gap: 6 }}>
                      {passSystemService
                        .getPassPerks("business")
                        .features.map((feature: string, index: number) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <MaterialIcons
                              name="check-circle"
                              size={16}
                              color="#4CAF50"
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.text.secondary,
                                marginLeft: 8,
                              }}
                            >
                              {translatePassDetail(feature)}
                            </Text>
                          </View>
                        ))}
                      {passSystemService
                        .getPassPerks("business")
                        .perks.map((perk: string, index: number) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <MaterialIcons
                              name="check-circle"
                              size={16}
                              color="#4CAF50"
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.text.secondary,
                                marginLeft: 8,
                              }}
                            >
                              {translatePassDetail(perk)}
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
                      borderColor: colors.divider,
                    }}
                    accessibilityLabel="Purchase VIP pass"
                    accessibilityRole="button"
                    onPress={openEventTickets}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 16,
                          fontWeight: "600",
                          color: colors.text.primary,
                        }}
                      >
                        {t({ id: "passes.type.vip", message: "VIP" })}
                      </Text>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "700",
                          color: "#FFD700",
                        }}
                      >
                        {getTierPrice("vip")}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.text.secondary,
                        marginBottom: 12,
                      }}
                    >
                      {t({
                        id: "passes.passPerks.vip.networking",
                        message: "+ VIP networking with speakers",
                      })}
                    </Text>
                    <View style={{ gap: 6 }}>
                      {passSystemService
                        .getPassPerks("vip")
                        .features.map((feature: string, index: number) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <MaterialIcons
                              name="check-circle"
                              size={16}
                              color="#4CAF50"
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.text.secondary,
                                marginLeft: 8,
                              }}
                            >
                              {translatePassDetail(feature)}
                            </Text>
                          </View>
                        ))}
                      {passSystemService
                        .getPassPerks("vip")
                        .perks.map((perk: string, index: number) => (
                          <View
                            key={index}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                            }}
                          >
                            <MaterialIcons
                              name="check-circle"
                              size={16}
                              color="#4CAF50"
                            />
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.text.secondary,
                                marginLeft: 8,
                              }}
                            >
                              {translatePassDetail(perk)}
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
            <View
              style={{
                padding: 16,
                backgroundColor: colors.background.default,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.divider,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: colors.text.primary,
                  marginBottom: 8,
                }}
              >
                {t({
                  id: "passes.purchasePass",
                  message: "Purchase Event Pass",
                })}
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.text.secondary,
                  marginBottom: 12,
                }}
              >
                {t({
                  id: "passes.purchasePass.description",
                  message:
                    "Choose from our available pass types to access speaker meetings and networking opportunities.",
                })}
              </Text>

              <View style={{ gap: 8 }}>
                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 12,
                    backgroundColor: colors.background.paper,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.divider,
                  }}
                  onPress={openEventTickets}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: "#34A85320",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 8,
                      }}
                    >
                      <MaterialIcons name="person" size={16} color="#34A853" />
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: colors.text.primary,
                      }}
                    >
                      {t({ id: "passes.type.general", message: "General" })}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: "#34A853",
                    }}
                  >
                    $99
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 12,
                    backgroundColor: colors.background.paper,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.divider,
                  }}
                  onPress={openEventTickets}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: "#007AFF20",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 8,
                      }}
                    >
                      <MaterialIcons
                        name="business"
                        size={16}
                        color="#007AFF"
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: colors.text.primary,
                      }}
                    >
                      {t({ id: "passes.type.business", message: "Business" })}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: "#007AFF",
                    }}
                  >
                    $249
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 12,
                    backgroundColor: colors.background.paper,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.divider,
                  }}
                  onPress={openEventTickets}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: "#FFD70020",
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 8,
                      }}
                    >
                      <MaterialIcons name="star" size={16} color="#FFD700" />
                    </View>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: colors.text.primary,
                      }}
                    >
                      {t({ id: "passes.type.vip", message: "VIP" })}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: "700",
                      color: "#FFD700",
                    }}
                  >
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
              alignItems: "center",
              marginTop: 16,
            }}
            onPress={onRequestPress}
            activeOpacity={0.7}
          >
            <Text
              style={{
                color: "white",
                fontSize: 16,
                fontWeight: "600",
              }}
            >
              {t({
                id: "passes.button.requestMeeting",
                message: "Request Meeting",
              })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const isVipPass = passInfo.pass_type === "vip";
  const passAccent = isVipPass ? palette.vipFill : palette.accent;
  return (
    <Surface
      mode={uiMode}
      style={{
        backgroundColor: palette.raised,
        margin: uiTokens.space.lg,
      }}
    >
      {/* Pass Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: uiTokens.space.lg,
          gap: uiTokens.space.md,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: uiTokens.radius.circle,
            backgroundColor: palette.surface,
            borderWidth: uiTokens.control.borderWidth,
            borderColor: palette.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MaterialIcons
            name={
              isVipPass
                ? "star"
                : passInfo.pass_type === "business"
                  ? "business"
                  : "person"
            }
            size={22}
            color={passAccent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: palette.text,
            }}
          >
            {getPassTypeDisplayName(passInfo.pass_type)}
          </Text>
          <TouchableOpacity
            accessibilityLabel={t({
              id: "passes.viewFullDetails",
              message: "View full pass details",
            })}
            onPress={openPassDetails}
            activeOpacity={0.7}
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: uiTokens.space.xs,
            }}
          >
            <Text
              style={{
                fontSize: uiTokens.type.caption,
                color: palette.muted,
              }}
            >
              {`${t({ id: "passes.pass", message: "Pass" })} #${displayPassNumber}`}
            </Text>
            <MaterialIcons name="open-in-new" size={14} color={palette.muted} />
          </TouchableOpacity>
        </View>
        <Badge
          mode={uiMode}
          tone="neutral"
          compact
          markerColor={
            passInfo.status === "active" ? palette.success : palette.muted
          }
        >
          {t({
            id: `passes.status.${passInfo.status}`,
            message: passInfo.status,
          })}
        </Badge>
      </View>

      {/* Pass Stats */}
      <View
        style={{
          flexDirection: "row",
          marginBottom: uiTokens.space.lg,
          paddingVertical: uiTokens.space.md,
          borderRadius: uiTokens.radius.input,
          backgroundColor: palette.surface,
          borderWidth: uiTokens.control.borderWidth,
          borderColor: palette.border,
        }}
      >
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: palette.text }}>
            {passInfo.max_requests || 0}
          </Text>
          <Text
            style={{
              fontSize: uiTokens.type.caption,
              color: palette.muted,
              textAlign: "center",
            }}
          >
            {translate("meetingRequests", {})}
          </Text>
        </View>
        <View
          style={{
            width: uiTokens.control.borderWidth,
            backgroundColor: palette.border,
          }}
        />
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={{ fontSize: 24, fontWeight: "700", color: palette.text }}>
            {passInfo.max_boost || 0}
          </Text>
          <Text
            style={{
              fontSize: uiTokens.type.caption,
              color: palette.muted,
              textAlign: "center",
            }}
          >
            {t({ id: "passes.boostPoints", message: "Boost points" })}
          </Text>
        </View>
      </View>

      {/* Entitlements per tier (no prices) with a ticket link on each. */}
      {mode === "speaker" && passInfo && renderTierShowcase()}

      {/* Dashboard-only demo comparison; speaker details link to event tickets. */}
      {mode !== "speaker" && passInfo && showComparison && isDemoMode && (
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 12,
              color: colors.text.secondary,
              marginBottom: 12,
              textAlign: "center",
            }}
          >
            {t({
              id: "passes.passComparison.compare",
              message:
                "Compare features and choose the right pass for your needs",
            })}
          </Text>

          {/* Current Pass Info */}
          {passInfo && (
            <View
              style={{
                padding: 12,
                backgroundColor: `${getPassTypeColor(passInfo.pass_type)}20`,
                borderRadius: 8,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: getPassTypeColor(passInfo.pass_type),
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.text.primary,
                  marginBottom: 4,
                }}
              >
                {t({ id: "passes.currentPass", message: "Your Current Pass" })}:{" "}
                {getPassTypeDisplayName(passInfo.pass_type)}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.secondary,
                }}
              >
                {passInfo.max_requests || 0}{" "}
                {t({
                  id: "passes.meetingRequests",
                  message: "Meeting Requests",
                })}{" "}
                • {passInfo.max_boost || 0}{" "}
                {t({ id: "passes.boostPoints", message: "Boost points" })}
              </Text>
            </View>
          )}

          <View style={{ gap: 12 }}>
            {/* General Pass */}
            <View
              style={{
                padding: 16,
                backgroundColor: colors.background.default,
                borderRadius: 8,
                borderWidth: 1,
                borderColor:
                  passInfo?.pass_type === "general"
                    ? "#34A853"
                    : colors.divider,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: colors.text.primary,
                  }}
                >
                  {t({ id: "passes.type.general", message: "General" })}
                </Text>
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: "#34A853" }}
                >
                  {getTierPrice("general")}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.secondary,
                  marginBottom: 12,
                }}
              >
                {t({
                  id: "passes.passPerks.general.conferences",
                  message: "Conferences only",
                })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService
                  .getPassPerks("general")
                  .features.map((feature: string, index: number) => (
                    <View
                      key={index}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <MaterialIcons
                        name="check-circle"
                        size={16}
                        color="#4CAF50"
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.text.secondary,
                          marginLeft: 8,
                        }}
                      >
                        {translatePassDetail(feature)}
                      </Text>
                    </View>
                  ))}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <MaterialIcons
                    name="check-circle"
                    size={16}
                    color="#4CAF50"
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.text.secondary,
                      marginLeft: 8,
                    }}
                  >
                    {getTier("general")?.max_meeting_requests ??
                      passInfo.max_requests}{" "}
                    {t({
                      id: "passes.meetingRequests",
                      message: "Meeting Requests",
                    })}
                  </Text>
                </View>
                {passSystemService
                  .getPassPerks("general")
                  .perks.map((perk: string, index: number) => (
                    <View
                      key={index}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <MaterialIcons
                        name="check-circle"
                        size={16}
                        color="#4CAF50"
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.text.secondary,
                          marginLeft: 8,
                        }}
                      >
                        {translatePassDetail(perk)}
                      </Text>
                    </View>
                  ))}
              </View>
            </View>

            {/* Business Pass */}
            <View
              style={{
                padding: 16,
                backgroundColor: colors.background.default,
                borderRadius: 8,
                borderWidth: 1,
                borderColor:
                  passInfo?.pass_type === "business"
                    ? "#007AFF"
                    : colors.divider,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: colors.text.primary,
                  }}
                >
                  {t({ id: "passes.type.business", message: "Business" })}
                </Text>
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: "#007AFF" }}
                >
                  {getTierPrice("business")}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.secondary,
                  marginBottom: 12,
                }}
              >
                {t({
                  id: "passes.passPerks.business.networking",
                  message: "+ Networking & B2B sessions",
                })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService
                  .getPassPerks("business")
                  .features.map((feature: string, index: number) => (
                    <View
                      key={index}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <MaterialIcons
                        name="check-circle"
                        size={16}
                        color="#4CAF50"
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.text.secondary,
                          marginLeft: 8,
                        }}
                      >
                        {translatePassDetail(feature)}
                      </Text>
                    </View>
                  ))}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <MaterialIcons
                    name="check-circle"
                    size={16}
                    color="#4CAF50"
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.text.secondary,
                      marginLeft: 8,
                    }}
                  >
                    {getTier("business")?.max_meeting_requests ?? 0}{" "}
                    {t({
                      id: "passes.meetingRequests",
                      message: "Meeting Requests",
                    })}
                  </Text>
                </View>
                {passSystemService
                  .getPassPerks("business")
                  .perks.map((perk: string, index: number) => (
                    <View
                      key={index}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <MaterialIcons
                        name="check-circle"
                        size={16}
                        color="#4CAF50"
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.text.secondary,
                          marginLeft: 8,
                        }}
                      >
                        {translatePassDetail(perk)}
                      </Text>
                    </View>
                  ))}
              </View>
            </View>

            {/* VIP Pass */}
            <View
              style={{
                padding: 16,
                backgroundColor: colors.background.default,
                borderRadius: 8,
                borderWidth: 1,
                borderColor:
                  passInfo?.pass_type === "vip" ? "#FFD700" : colors.divider,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: colors.text.primary,
                  }}
                >
                  {t({ id: "passes.type.vip", message: "VIP" })}
                </Text>
                <Text
                  style={{ fontSize: 18, fontWeight: "700", color: "#FFD700" }}
                >
                  {getTierPrice("vip")}
                </Text>
              </View>
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.secondary,
                  marginBottom: 12,
                }}
              >
                {t({
                  id: "passes.passPerks.vip.networking",
                  message: "+ VIP networking with speakers",
                })}
              </Text>
              <View style={{ gap: 6 }}>
                {passSystemService
                  .getPassPerks("vip")
                  .features.map((feature: string, index: number) => (
                    <View
                      key={index}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <MaterialIcons
                        name="check-circle"
                        size={16}
                        color="#4CAF50"
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.text.secondary,
                          marginLeft: 8,
                        }}
                      >
                        {translatePassDetail(feature)}
                      </Text>
                    </View>
                  ))}
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <MaterialIcons
                    name="check-circle"
                    size={16}
                    color="#4CAF50"
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.text.secondary,
                      marginLeft: 8,
                    }}
                  >
                    {getTier("vip")?.max_meeting_requests ?? 0}{" "}
                    {t({
                      id: "passes.meetingRequests",
                      message: "Meeting Requests",
                    })}
                  </Text>
                </View>
                {passSystemService
                  .getPassPerks("vip")
                  .perks.map((perk: string, index: number) => (
                    <View
                      key={index}
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <MaterialIcons
                        name="check-circle"
                        size={16}
                        color="#4CAF50"
                      />
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.text.secondary,
                          marginLeft: 8,
                        }}
                      >
                        {translatePassDetail(perk)}
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: uiTokens.space.md,
            marginBottom: uiTokens.space.lg,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: uiTokens.radius.pill,
              marginTop: 6,
              backgroundColor:
                requestStatusLoading || hasExistingRequest
                  ? palette.muted
                  : requestLimits.canSendRequest
                    ? palette.success
                    : palette.danger,
            }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: uiTokens.type.label,
                fontWeight: "600",
                color: palette.text,
                marginBottom: uiTokens.space.xs,
              }}
            >
              {requestStatusLoading
                ? t({
                    id: "passes.checkingRequest",
                    message: "Checking meeting request status…",
                  })
                : requestLimits.canSendRequest
                  ? t({
                      id: "passes.canRequestMeeting",
                      message: "Can request meeting",
                    })
                  : hasExistingRequest
                    ? t({
                        id: "passes.requestPending",
                        message: "Meeting request pending",
                      })
                    : t({
                        id: "passes.cannotRequestMeeting",
                        message: "Cannot request meeting",
                      })}
            </Text>
            <Text style={{ fontSize: uiTokens.type.caption, color: palette.muted }}>
              {requestStatusLoading
                ? t({
                    id: "passes.checkingRequestDescription",
                    message: "Confirming the latest response from this speaker.",
                  })
                : requestLimits.canSendRequest
                  ? t({
                      id: "passes.requestAllowed",
                      message: "You can send a meeting request.",
                    })
                  : hasExistingRequest
                    ? isPendingExistingRequest
                      ? t({
                          id: "passes.requestPendingDescription",
                          message:
                            "Your request is waiting for the speaker’s response.",
                        })
                      : t({
                          id: "passes.requestInProgressDescription",
                          message:
                            "You already have an active request with this speaker.",
                        })
                    : passSystemService.getPassValidationMessage(requestLimits)}
            </Text>
            {canResetRequestLimits && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t({
                  id: "passes.resetMeetingRequestLimit",
                  message: "Reset limit",
                })}
                onPress={resetRequestLimits}
                disabled={resettingLimits}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  alignSelf: "flex-start",
                  marginTop: uiTokens.space.md,
                  minHeight: uiTokens.control.compactHeight,
                  paddingHorizontal: uiTokens.space.lg,
                  borderRadius: uiTokens.radius.pill,
                  borderWidth: uiTokens.control.borderWidth,
                  borderColor: palette.border,
                  opacity: resettingLimits ? 0.5 : 1,
                }}
              >
                {resettingLimits && (
                  <ActivityIndicator size="small" color={palette.accent} />
                )}
                <Text
                  style={{
                    color: palette.accent,
                    fontSize: uiTokens.type.label,
                    fontWeight: "600",
                    marginLeft: resettingLimits ? uiTokens.space.sm : 0,
                  }}
                >
                  {t({
                    id: "passes.resetMeetingRequestLimit",
                    message: `Reset limit · ${MEETING_REQUEST_LIMIT_RESET_COST} Boost points`,
                  })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Request Button - Always show but disabled when no pass or limit reached */}
      {showRequestButton && onRequestPress && (
        <ActionButton
          mode={uiMode}
          label={
            !passInfo
              ? t({ id: "passes.button.passRequired", message: "Pass Required" })
              : requestStatusLoading
                ? t({ id: "passes.button.checking", message: "Checking requests…" })
                : hasExistingRequest
                  ? t({ id: "passes.viewRequest", message: "View request" })
                  : !requestLimits?.canSendRequest
                    ? t({ id: "passes.button.limitReached", message: "Limit Reached" })
                    : t({ id: "passes.button.requestMeeting", message: "Request Meeting" })
          }
          variant={hasExistingRequest ? "secondary" : "primary"}
          onPress={hasExistingRequest ? onExistingRequestPress : onRequestPress}
          disabled={
            !passInfo ||
            requestStatusLoading ||
            (!requestLimits?.canSendRequest && !hasExistingRequest)
          }
          style={{ alignSelf: "stretch" }}
        />
      )}
    </Surface>
  );
}

// A malformed pass record (e.g. a null pass_type/status from a row the
// service layer didn't fully normalize) can throw during PassCard's render.
// That's a real defect to fix at the source, but this boundary is the
// backstop: it keeps a bad pass from taking down the whole dashboard, and
// reports the real error to Sentry so a future occurrence is diagnosable
// instead of showing up as a silent, unexplained close.
type PassesDisplayBoundaryState = { error: Error | null };

class PassesDisplayBoundary extends React.Component<
  PassesDisplayProps,
  PassesDisplayBoundaryState
> {
  constructor(props: PassesDisplayProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): PassesDisplayBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(
      "[PassesDisplay] render error contained by boundary:",
      error?.message,
      info?.componentStack,
    );
    Sentry.captureException(error, {
      contexts: { react: { componentStack: info?.componentStack } },
    });
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
    if ((this.props.mode ?? "dashboard") === "dashboard") {
      return (
        <PassesWallet
          eventIds={this.props.eventIds}
          refreshTrigger={this.props.refreshTrigger}
          layout={this.props.walletLayout}
          explorerFilters={this.props.explorerFilters}
          hideWalletControls={this.props.hideWalletControls}
          hideWalletReload={this.props.hideWalletReload}
          businessInviteCode={this.props.businessInviteCode}
          onPassesLoaded={(passes: PassInfo[]) => {
            this.props.onPassInfoLoaded?.(passes[0] ?? null);
            this.props.onPassesLoaded?.(passes);
          }}
          onPassesLoadingChange={this.props.onPassesLoadingChange}
        />
      );
    }

    return <PassesDisplayInner {...this.props} />;
  }
}

export default function PassesDisplay(props: PassesDisplayProps) {
  return <PassesDisplayBoundary {...props} />;
}
