import React from "react";
import { Modal, StyleSheet, Text, View } from "react-native";
import { ActionButton, ModalBackdrop, Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "../../i18n/i18n";

export type BusinessInviteRequestDialogStatus =
  "pending" | "approved" | "rejected" | "error";

interface BusinessInviteRequestModalProps {
  status: BusinessInviteRequestDialogStatus | null;
  onClose: () => void;
  onRetry: () => void;
}

const copyByStatus = {
  pending: {
    title: "Business access pending review",
    message:
      "Your BSL and Colombia Blockchain Week Business access request is awaiting confirmation. We’ll notify you when it is reviewed.",
  },
  approved: {
    title: "Business access approved",
    message: "Your BSL and Colombia Blockchain Week Business access is active.",
  },
  rejected: {
    title: "Business access request not approved",
    message:
      "Your request was reviewed and was not approved. Contact HASHPASS support if you need help.",
  },
  error: {
    title: "Could not submit your Business access request",
    message:
      "Check your connection and try again. No Business access has been granted yet.",
  },
} as const;

export default function BusinessInviteRequestModal({
  status,
  onClose,
  onRetry,
}: BusinessInviteRequestModalProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation("passes");
  const mode = isDark ? "dark" : "light";
  const palette = uiPalette(mode);
  const copy = status ? copyByStatus[status] : null;

  return (
    <Modal
      visible={Boolean(status)}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <ModalBackdrop mode={mode}>
        {copy && (
          <Surface
            mode={mode}
            accessibilityRole="alert"
            accessibilityLabel={copy.title}
            style={[styles.dialog, { shadowColor: palette.text }]}
          >
            <Text style={[styles.title, { color: palette.text }]}>
              {t(`businessInvite.${status}.title`, copy.title)}
            </Text>
            <Text style={[styles.message, { color: palette.muted }]}>
              {t(`businessInvite.${status}.message`, copy.message)}
            </Text>
            <View style={styles.actions}>
              {status === "error" && (
                <ActionButton
                  mode={mode}
                  variant="secondary"
                  label={t("businessInvite.retry", "Try again")}
                  onPress={onRetry}
                />
              )}
              <ActionButton
                mode={mode}
                label={t("businessInvite.close", "Close")}
                onPress={onClose}
              />
            </View>
          </Surface>
        )}
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    width: "100%",
    maxWidth: 480,
    gap: uiTokens.space.lg,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 36,
    elevation: 14,
  },
  title: {
    fontSize: uiTokens.type.title,
    lineHeight: 30,
    fontWeight: "700",
  },
  message: {
    fontSize: uiTokens.type.body,
    lineHeight: 24,
  },
  actions: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: uiTokens.space.sm,
  },
});
