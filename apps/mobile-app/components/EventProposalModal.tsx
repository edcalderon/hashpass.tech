import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "../lib/vector-icons";
import { useTheme } from "../hooks/useTheme";
import { useTranslation } from "../i18n/i18n";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";

type EventProposalModalProps = {
  visible: boolean;
  onClose: () => void;
};

const SUPPORT_EMAIL = "support@hashpass.tech";

export default function EventProposalModal({
  visible,
  onClose,
}: EventProposalModalProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation("index");
  const { width } = useWindowDimensions();
  const palette = uiPalette(isDark);
  const [eventName, setEventName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [eventDetails, setEventDetails] = useState("");
  const [isOpeningMail, setIsOpeningMail] = useState(false);
  const [mailError, setMailError] = useState(false);

  const canSubmit = useMemo(
    () =>
      Boolean(
        eventName.trim() &&
          contactName.trim() &&
          /^\S+@\S+\.\S+$/.test(email.trim()) &&
          eventDetails.trim(),
      ),
    [contactName, email, eventDetails, eventName],
  );

  const handleClose = () => {
    setMailError(false);
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit || isOpeningMail) return;

    setIsOpeningMail(true);
    setMailError(false);
    const subject = encodeURIComponent(
      `[HASHPASS Event Proposal] ${eventName.trim()}`,
    );
    const body = encodeURIComponent(
      [
        "Event proposal",
        "",
        `Event: ${eventName.trim()}`,
        `Contact: ${contactName.trim()}`,
        `Email: ${email.trim()}`,
        `Platform: ${Platform.OS}`,
        "",
        "Event details:",
        eventDetails.trim(),
      ].join("\n"),
    );
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;

    try {
      const supported = await Linking.canOpenURL(mailto);
      if (!supported) {
        setMailError(true);
        return;
      }

      await Linking.openURL(mailto);
    } catch {
      setMailError(true);
    } finally {
      setIsOpeningMail(false);
    }
  };

  const styles = getStyles(colors, palette, width);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t("eventProposal.title", "Propose an event")}</Text>
              <Text style={styles.subtitle}>
                {t(
                  "eventProposal.subtitle",
                  "Tell us about an event you would like to see in the public explorer.",
                )}
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("eventProposal.close", "Close")}
              onPress={handleClose}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={20} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Field
              label={t("eventProposal.eventName", "Event name")}
              value={eventName}
              onChangeText={setEventName}
              placeholder={t("eventProposal.eventNamePlaceholder", "Name of the event")}
              colors={colors}
            />
            <Field
              label={t("eventProposal.contactName", "Your name")}
              value={contactName}
              onChangeText={setContactName}
              placeholder={t("eventProposal.contactNamePlaceholder", "Contact name")}
              colors={colors}
            />
            <Field
              label={t("eventProposal.email", "Contact email")}
              value={email}
              onChangeText={setEmail}
              placeholder={t("eventProposal.emailPlaceholder", "you@example.com")}
              keyboardType="email-address"
              autoCapitalize="none"
              colors={colors}
            />
            <Field
              label={t("eventProposal.details", "Event details")}
              value={eventDetails}
              onChangeText={setEventDetails}
              placeholder={t(
                "eventProposal.detailsPlaceholder",
                "Date, city, venue, event link, and a short description",
              )}
              multiline
              colors={colors}
            />

            {mailError ? (
              <Text style={styles.errorText}>
                {t(
                  "eventProposal.mailError",
                  "We could not open your email app. Send your proposal to support@hashpass.tech.",
                )}
              </Text>
            ) : null}

            <Text style={styles.disclosure}>
              {t(
                "eventProposal.disclosure",
                "Your email app will open with these details. Review and send the message there.",
              )}
            </Text>

            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t("eventProposal.submit", "Prepare proposal email")}
              disabled={!canSubmit || isOpeningMail}
              onPress={handleSubmit}
              style={[
                styles.submitButton,
                (!canSubmit || isOpeningMail) && styles.submitButtonDisabled,
              ]}
            >
              {isOpeningMail ? (
                <ActivityIndicator color={palette.onAccent} />
              ) : (
                <Ionicons name="mail-outline" size={18} color={palette.onAccent} />
              )}
              <Text style={styles.submitText}>
                {isOpeningMail
                  ? t("eventProposal.openingMail", "Opening email…")
                  : t("eventProposal.submit", "Prepare proposal email")}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  colors: ReturnType<typeof useTheme>["colors"];
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "sentences";
  multiline?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  colors,
  keyboardType,
  autoCapitalize,
  multiline = false,
}: FieldProps) {
  return (
    <View style={fieldStyles.field}>
      <Text style={[fieldStyles.label, { color: colors.text.primary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.secondary}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        style={[
          fieldStyles.input,
          { borderColor: colors.border, color: colors.text.primary },
          multiline && fieldStyles.textArea,
        ]}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  field: { gap: 7 },
  label: { fontSize: 13, fontWeight: "700" },
  input: {
    minHeight: 46,
    borderWidth: 1,
  borderRadius: uiTokens.radius.input,
    paddingHorizontal: 13,
    fontSize: 15,
  },
  textArea: { minHeight: 104, paddingTop: 12, paddingBottom: 12 },
});

const getStyles = (
  colors: ReturnType<typeof useTheme>["colors"],
  palette: ReturnType<typeof uiPalette>,
  width: number,
) =>
  StyleSheet.create({
    overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.overlay },
    dialog: {
      width: "100%",
      maxWidth: 560,
      maxHeight: width < 600 ? "88%" : "82%",
      borderRadius: uiTokens.radius.card,
      overflow: "hidden",
      backgroundColor: palette.raised,
      borderWidth: 1,
      borderColor: palette.border,
      shadowColor: palette.canvas,
      shadowOpacity: 0.35,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 16 },
      elevation: 12,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 16,
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    headerCopy: { flex: 1, gap: 5 },
    title: { color: colors.text.primary, fontSize: 21, fontWeight: "800" },
    subtitle: { color: colors.text.secondary, fontSize: 14, lineHeight: 20 },
    closeButton: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: uiTokens.radius.circle,
      backgroundColor: palette.surface,
    },
    form: { gap: 16, padding: 22 },
    disclosure: { color: colors.text.secondary, fontSize: 12, lineHeight: 18 },
    errorText: { color: palette.danger, fontSize: 13, lineHeight: 18 },
    submitButton: {
      minHeight: 48,
      borderRadius: uiTokens.radius.media,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 9,
      backgroundColor: palette.accentFill,
      paddingHorizontal: 18,
    },
    submitButtonDisabled: { opacity: 0.45 },
    submitText: { color: palette.onAccent, fontSize: 15, fontWeight: "800" },
  });
