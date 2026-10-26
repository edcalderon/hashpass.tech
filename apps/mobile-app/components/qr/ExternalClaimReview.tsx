import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton, Badge, Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import type { ExternalClaimReviewProps } from "../../types/qr-ui.types";

/** Staff view of a scanned original ticket: who claimed it and what to do next. */
export default function ExternalClaimReview({ inspection, mode, onApprove }: ExternalClaimReviewProps) {
  const palette = uiPalette(mode);
  const claim = inspection.claim;
  const reviewable = claim?.status === "pending" || claim?.status === "validated";
  const rows: [string, string][] = claim
    ? [
        ["Issuer", claim.issuer],
        ["Event", claim.event_id],
        ["Ticket", `••••${claim.ticket_code_last4}`],
        ["Requested pass", claim.requested_pass_type.toUpperCase()],
        ...(claim.claimant_email ? ([["Claimed by", claim.claimant_email]] as [string, string][]) : []),
        ...(claim.hashpass_pass_id ? ([["HASHPASS pass", claim.hashpass_pass_id]] as [string, string][]) : []),
      ]
    : [];
  return (
    <View style={styles.stack}>
      <View style={styles.header}>
        <Ionicons
          name={inspection.valid ? "ticket-outline" : "alert-circle"}
          size={32}
          color={inspection.valid ? palette.accent : palette.danger}
        />
        <View style={styles.copy}>
          <Text style={[styles.title, { color: palette.text }]}>Original ticket</Text>
          <Text style={[styles.message, { color: palette.muted }]}>
            {inspection.message || (claim ? "Claim found" : "No matching claim is registered for this QR yet.")}
          </Text>
        </View>
        {claim ? <Badge mode={mode} tone={reviewable ? "accent" : "neutral"}>{claim.status.toUpperCase()}</Badge> : null}
      </View>
      {rows.length ? (
        <Surface mode={mode} style={styles.card}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[styles.label, { color: palette.muted }]}>{label}</Text>
              <Text style={[styles.value, { color: palette.text }]} selectable>{value}</Text>
            </View>
          ))}
        </Surface>
      ) : null}
      {reviewable ? (
        <ActionButton
          mode={mode}
          label="Approve & create pass"
          leadingIcon={<Ionicons name="shield-checkmark" size={18} color={palette.onAccent} />}
          onPress={onApprove}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: uiTokens.space.md },
  header: { flexDirection: "row", alignItems: "center", gap: uiTokens.space.md },
  copy: { flex: 1 },
  title: { fontSize: uiTokens.type.body + 2, fontWeight: "700" },
  message: { fontSize: uiTokens.type.label, marginTop: 2, lineHeight: 20 },
  card: { borderRadius: uiTokens.radius.media, borderWidth: uiTokens.control.borderWidth, padding: uiTokens.space.lg, gap: uiTokens.space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", gap: uiTokens.space.md },
  label: { fontSize: uiTokens.type.label },
  value: { fontSize: uiTokens.type.label, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
