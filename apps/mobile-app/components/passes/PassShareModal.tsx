import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { ActionButton, FormField, ModalBackdrop, Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { MaterialIcons } from "../../lib/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "../../i18n/i18n";
import { useToastHelpers } from "../../contexts/ToastContext";
import { createPublicPassShare, requestPassTransfer } from "../../lib/pass-sharing";
import { passSystemService } from "../../lib/pass-system";
import type { PassShareModalProps, PassShareView, PublicPassShare } from "../../types/PassShareModal.types";

export default function PassShareModal({ pass, visible, onClose }: PassShareModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation("passes");
  const { showSuccess, showError } = useToastHelpers();
  const mode = isDark ? "dark" : "light";
  const palette = uiPalette(mode);
  const [view, setView] = useState<PassShareView>("options");
  const [share, setShare] = useState<PublicPassShare | null>(null);
  const [loadingShare, setLoadingShare] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendingTransfer, setSendingTransfer] = useState(false);

  const passType = useMemo(
    () => passSystemService.getPassTypeDisplayName(pass.pass_type),
    [pass.pass_type],
  );
  const publicMessage = useMemo(
    () =>
      `Check out this ${passType} pass for ${pass.eventName}.\n${pass.eventDateLabel || ""}${pass.eventLocation ? ` · ${pass.eventLocation}` : ""}`,
    [pass.eventDateLabel, pass.eventLocation, pass.eventName, passType],
  );

  useEffect(() => {
    if (!visible) return;
    setView("options");
    setShare(null);
    setRecipientEmail("");
  }, [visible, pass.pass_id]);

  const ensureShare = async () => {
    if (share) return share;
    setLoadingShare(true);
    try {
      const created = await createPublicPassShare(pass.pass_id, pass.eventId);
      setShare(created);
      return created;
    } catch (error) {
      showError(
        t("share.failedTitle", "Sharing unavailable"),
        error instanceof Error ? error.message : t("share.failedBody", "Please try again."),
      );
      return null;
    } finally {
      setLoadingShare(false);
    }
  };

  const sharePublicDetails = async () => {
    const created = await ensureShare();
    if (!created) return;
    try {
      if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: `${pass.eventName} ${passType} Pass`, text: publicMessage, url: created.url });
      } else if (Platform.OS !== "web" && Share.share) {
        await Share.share({ title: `${pass.eventName} ${passType} Pass`, message: `${publicMessage}\n${created.url}`, url: created.url });
      } else {
        await Clipboard.setStringAsync(`${publicMessage}\n${created.url}`);
        showSuccess(t("share.copiedTitle", "Public pass link copied"), t("share.copiedBody", "Share the link with your community."));
      }
    } catch (error) {
      if (error instanceof Error && /cancel|abort/i.test(error.message)) return;
      showError(t("share.failedTitle", "Sharing unavailable"), t("share.failedBody", "Please try again."));
    }
  };

  const copyPublicLink = async () => {
    const created = await ensureShare();
    if (!created) return;
    try {
      await Clipboard.setStringAsync(created.url);
      showSuccess(t("share.copiedTitle", "Public pass link copied"), t("share.copiedBody", "Share the link with your community."));
    } catch {
      showError(t("share.failedTitle", "Sharing unavailable"), t("share.copyFailed", "Unable to copy the public link."));
    }
  };

  const submitTransfer = async () => {
    if (sendingTransfer || !recipientEmail.trim()) return;
    setSendingTransfer(true);
    try {
      await requestPassTransfer({ passId: pass.pass_id, eventId: pass.eventId, recipientEmail: recipientEmail.trim() });
      showSuccess(t("transfer.sentTitle", "Transfer confirmation sent"), t("transfer.sentBody", "Both email confirmations are required before this pass moves.") );
      setRecipientEmail("");
      setView("options");
    } catch (error) {
      showError(t("transfer.failedTitle", "Transfer unavailable"), error instanceof Error ? error.message : t("transfer.failedBody", "Please try again."));
    } finally {
      setSendingTransfer(false);
    }
  };

  const renderHeader = () => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: uiTokens.space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: uiTokens.space.sm, flex: 1 }}>
        {view !== "options" && (
          <Pressable onPress={() => setView("options")} accessibilityRole="button" accessibilityLabel={t("share.back", "Back")} hitSlop={10}>
            <MaterialIcons name="arrow-back" size={22} color={palette.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: "800" }}>
            {view === "transfer" ? t("transfer.title", "Transfer ticket") : view === "qr" ? t("share.qrTitle", "Public pass QR") : t("share.title", "Share pass")}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {pass.eventName} · {passType}
          </Text>
        </View>
      </View>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t("share.close", "Close share options")} hitSlop={10}>
        <MaterialIcons name="close" size={24} color={palette.text} />
      </Pressable>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <ModalBackdrop mode={mode}>
        <Surface mode={mode} style={{ width: "100%", maxWidth: 480, maxHeight: "92%", padding: uiTokens.space.lg }}>
          {renderHeader()}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: uiTokens.space.sm }}>
            {view === "options" && (
              <>
                <Text style={{ color: palette.muted, lineHeight: 20, marginBottom: uiTokens.space.xs }}>
                  {t("share.description", "Share safe public details without exposing your pass number or admission QR.")}
                </Text>
                <ActionButton
                  mode={mode}
                  label={t("share.publicDetails", "Share public details")}
                  onPress={() => void sharePublicDetails()}
                  loading={loadingShare}
                  leadingIcon={<MaterialIcons name="public" size={18} color={palette.onAccent} />}
                />
                <ActionButton
                  mode={mode}
                  variant="secondary"
                  label={t("share.copyLink", "Copy public link")}
                  onPress={() => void copyPublicLink()}
                  disabled={loadingShare}
                  leadingIcon={<MaterialIcons name="link" size={18} color={palette.accent} />}
                />
                <ActionButton
                  mode={mode}
                  variant="secondary"
                  label={t("share.showQr", "Show public QR")}
                  onPress={async () => {
                    const created = await ensureShare();
                    if (created) setView("qr");
                  }}
                  disabled={loadingShare}
                  leadingIcon={<MaterialIcons name="qr-code-2" size={18} color={palette.accent} />}
                />
                <View style={{ height: 1, backgroundColor: colors.divider, marginVertical: uiTokens.space.sm }} />
                <ActionButton
                  mode={mode}
                  variant="ghost"
                  label={t("transfer.action", "Transfer ticket securely")}
                  onPress={() => setView("transfer")}
                  leadingIcon={<MaterialIcons name="swap-horiz" size={18} color={palette.accent} />}
                />
                <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>
                  {t("transfer.securityNote", "Transfers require confirmation from both email accounts and expire after 24 hours.")}
                </Text>
              </>
            )}
            {view === "qr" && (
              <View style={{ alignItems: "center", gap: uiTokens.space.md }}>
                <Text style={{ color: palette.muted, textAlign: "center", lineHeight: 20 }}>
                  {t("share.qrDescription", "Scan to view the public pass details. This QR cannot be used for admission.")}
                </Text>
                {share?.qrValue ? <QRCode value={share.qrValue} size={220} color={palette.text} backgroundColor={palette.surface} quietZone={uiTokens.space.sm} ecl="H" /> : <ActivityIndicator color={palette.accent} />}
                {share?.url ? <Text selectable style={{ color: palette.accent, fontSize: 12, textAlign: "center" }}>{share.url}</Text> : null}
                <ActionButton mode={mode} variant="secondary" label={t("share.copyLink", "Copy public link")} onPress={() => void copyPublicLink()} />
              </View>
            )}
            {view === "transfer" && (
              <View style={{ gap: uiTokens.space.md }}>
                <Text style={{ color: palette.muted, lineHeight: 20 }}>
                  {t("transfer.description", "Send this pass to another verified HASHPASS account. You and the recipient must confirm by email before ownership changes.")}
                </Text>
                <FormField
                  mode={mode}
                  label={t("transfer.recipient", "Recipient email")}
                  value={recipientEmail}
                  onChangeText={setRecipientEmail}
                  placeholder={t("transfer.recipientPlaceholder", "name@example.com")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <ActionButton
                  mode={mode}
                  label={sendingTransfer ? t("transfer.sending", "Sending…") : t("transfer.send", "Send confirmation emails")}
                  onPress={() => void submitTransfer()}
                  disabled={sendingTransfer || !recipientEmail.trim()}
                  loading={sendingTransfer}
                  leadingIcon={!sendingTransfer ? <MaterialIcons name="email" size={18} color={palette.onAccent} /> : undefined}
                />
                <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>
                  {t("transfer.privacyNote", "Only the recipient email and pass event are shared. Your pass number and admission QR remain private.")}
                </Text>
              </View>
            )}
          </ScrollView>
        </Surface>
      </ModalBackdrop>
    </Modal>
  );
}
