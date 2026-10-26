import React, { Suspense, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Text, TextInput, View } from "react-native";
import { ActionButton, ModalBackdrop, Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "../../i18n/i18n";
import { useToastHelpers } from "../../contexts/ToastContext";
import { submitExternalTicketClaim } from "../../lib/external-ticket-claims";
import type { PassUpgradeRequestModalProps } from "../../types/PassUpgradeRequestModal.types";

// Keep the scanner out of the initial bundle (and out of native/Jest paths that
// do not have the camera dependencies). It is loaded only after the user opts
// into scanning the original ticket QR.
const TicketQrScanner = React.lazy(() =>
  Promise.resolve(require("../QRScanner")),
);

const passTypeLabel = (passType: "business" | "vip") =>
  passType === "vip" ? "VIP" : "Business";

export default function PassUpgradeRequestModal({
  pass,
  requestedPassType,
  visible,
  onClose,
}: PassUpgradeRequestModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation("passes");
  const { showSuccess, showError } = useToastHelpers();
  const [ticketReference, setTicketReference] = useState("");
  const [ticketQrPayload, setTicketQrPayload] = useState("");
  const [showTicketScanner, setShowTicketScanner] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPassType, setSelectedPassType] = useState(requestedPassType);
  const mode = isDark ? "dark" : "light";
  const palette = uiPalette(mode);
  const canChooseVip = pass.pass_type === "general";
  const requestedLabel = passTypeLabel(selectedPassType);

  useEffect(() => {
    if (visible) setSelectedPassType(requestedPassType);
  }, [requestedPassType, visible]);

  const submit = async () => {
    if (submitting) return;
    if (!ticketReference.trim()) {
      showError(
        t("upgradeRequest.referenceRequiredTitle", "Ticket code required"),
        t("upgradeRequest.referenceRequiredMessage", "Enter the code from the original event ticket."),
      );
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitExternalTicketClaim({
        eventId: pass.eventId,
        ticketCode: ticketReference,
        qrPayload: ticketQrPayload,
        requestedPassType: selectedPassType,
      });
      showSuccess(
        t("upgradeRequest.submittedTitle", "Upgrade request sent"),
        result.status === "pending"
          ? t(
              "upgradeRequest.alreadyPending",
              "Your request is already with the event team.",
            )
          : t(
              "upgradeRequest.submittedMessage",
              "The event team will verify your ticket and update your pass.",
            ),
      );
      setTicketReference("");
      setTicketQrPayload("");
      onClose();
    } catch (error) {
      showError(
        t("upgradeRequest.failedTitle", "Could not send request"),
        error instanceof Error
          ? error.message
          : t("upgradeRequest.failedMessage", "Please try again."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <ModalBackdrop mode={mode}>
        <Surface
          mode={mode}
          accessibilityLabel={t(
            "upgradeRequest.title",
            "Claim an existing ticket",
          )}
          style={{ width: "100%", maxWidth: 480, gap: uiTokens.space.lg }}
        >
          <View style={{ gap: uiTokens.space.xs }}>
            <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: "700" }}>
              {t("upgradeRequest.title", "Claim an existing ticket")}
            </Text>
            <Text style={{ color: palette.muted, fontSize: uiTokens.type.body, lineHeight: 22 }}>
              {t(
                "upgradeRequest.message",
                "Already have a Business or VIP ticket? Send its reference and we’ll connect it to this pass after verification.",
              )}
            </Text>
          </View>
          <View style={{ gap: uiTokens.space.xs }}>
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: "700" }}>
              {t("upgradeRequest.target", "Original ticket tier")}: {requestedLabel}
            </Text>
            {canChooseVip ? (
              <View style={{ flexDirection: "row", gap: uiTokens.space.sm }}>
                {(["business", "vip"] as const).map((passType) => (
                  <ActionButton
                    key={passType}
                    mode={mode}
                    variant={selectedPassType === passType ? undefined : "secondary"}
                    label={passTypeLabel(passType)}
                    onPress={() => setSelectedPassType(passType)}
                    disabled={submitting}
                  />
                ))}
              </View>
            ) : null}
            <TextInput
              value={ticketReference}
              onChangeText={setTicketReference}
              placeholder={t(
                "upgradeRequest.referencePlaceholder",
                "Original ticket code (required)",
              )}
              placeholderTextColor={palette.muted}
              autoCapitalize="characters"
              maxLength={120}
              style={{
                color: palette.text,
                borderColor: colors.divider,
                borderWidth: 1,
                borderRadius: uiTokens.radius.input,
                paddingHorizontal: 12,
                paddingVertical: 11,
                fontSize: 15,
              }}
            />
            <ActionButton
              mode={mode}
              variant="secondary"
              label={ticketQrPayload
                ? t("upgradeRequest.qrCaptured", "Original ticket QR captured")
                : t("upgradeRequest.scanQr", "Scan original ticket QR")}
              onPress={() => setShowTicketScanner(true)}
              disabled={submitting}
            />
            <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>
              {t(
                "upgradeRequest.verificationHint",
                "The code is required. Scanning the original QR adds stronger proof and prevents duplicate claims.",
              )}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: uiTokens.space.sm }}>
            <ActionButton
              mode={mode}
              variant="secondary"
              label={t("upgradeRequest.cancel", "Cancel")}
              onPress={onClose}
              disabled={submitting}
            />
            <ActionButton
              mode={mode}
              label={submitting ? t("upgradeRequest.sending", "Sending…") : t("upgradeRequest.submit", "Send request")}
              onPress={() => void submit()}
              disabled={submitting}
              leadingIcon={submitting ? <ActivityIndicator color={colors.primaryContrastText} size="small" /> : undefined}
            />
          </View>
        </Surface>
      </ModalBackdrop>
      {showTicketScanner ? (
        <Suspense fallback={null}>
          <TicketQrScanner
            visible
            onClose={() => setShowTicketScanner(false)}
            title={t("upgradeRequest.scanQrTitle", "Scan original ticket QR")}
            description={t("upgradeRequest.scanQrDescription", "Scan the QR from your Blockchain Summit ticket email")}
            onRawScan={(raw: string) => {
              setTicketQrPayload(raw);
              setShowTicketScanner(false);
              return true;
            }}
          />
        </Suspense>
      ) : null}
    </Modal>
  );
}
