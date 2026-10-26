import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Badge, Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import type { ScanResultCardProps } from "../../types/qr-ui.types";

const initialsOf = (value: string) =>
  value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";

/**
 * The one result view for a resolved HashPass QR: who holds it, what it is
 * worth, and whether it is usable. Email only arrives from the server for
 * staff, so showing it when present is safe.
 */
export default function ScanResultCard({ resolution, mode, showUsage = false }: ScanResultCardProps) {
  const palette = uiPalette(mode);
  const { user, pass } = resolution;
  const usable = resolution.valid;
  const displayName = user?.name || (user?.username ? `@${user.username}` : "HASHPASS member");
  const statusColor = pass?.status === "active" ? palette.success : palette.danger;

  const rows: [string, string, string?][] = pass
    ? [
        ["Pass", pass.number || pass.id],
        ["Tier", pass.type?.toUpperCase() || "PASS"],
        ["Status", pass.status?.toUpperCase() || "UNAVAILABLE", statusColor],
        ["Event", pass.eventId],
        ...(showUsage
          ? ([
              ["Meeting requests", `${pass.requests.used} / ${pass.requests.max}`],
              ["Boost", `${pass.boost.used} / ${pass.boost.max}`],
            ] as [string, string][])
          : []),
      ]
    : [];

  return (
    <View style={styles.stack}>
      <View style={styles.header}>
        <Ionicons
          name={usable ? "checkmark-circle" : "alert-circle"}
          size={32}
          color={usable ? palette.success : palette.danger}
        />
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: palette.text }]}>
            {usable ? (pass ? "Valid pass" : "HASHPASS member") : "Pass unavailable"}
          </Text>
          <Text style={[styles.message, { color: palette.muted }]}>{resolution.message}</Text>
        </View>
      </View>

      {user ? (
        <Surface mode={mode} style={styles.card}>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: palette.accentSoft, borderColor: palette.border }]}>
              <Text style={[styles.avatarText, { color: palette.accent }]}>{initialsOf(user.name || user.username || "")}</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text style={[styles.name, { color: palette.text }]} selectable numberOfLines={2}>{displayName}</Text>
              {user.username && user.name ? (
                <Text style={[styles.meta, { color: palette.muted }]} selectable>@{user.username}</Text>
              ) : null}
              {user.email ? (
                <Text style={[styles.meta, { color: palette.muted }]} selectable numberOfLines={1}>{user.email}</Text>
              ) : null}
            </View>
            {pass?.type ? <Badge mode={mode} tone="accent">{pass.type.toUpperCase()}</Badge> : null}
          </View>
        </Surface>
      ) : null}

      {rows.length ? (
        <Surface mode={mode} style={styles.card}>
          {rows.map(([label, value, color], index) => (
            <View
              key={label}
              style={[styles.row, index > 0 && { borderTopWidth: uiTokens.control.borderWidth, borderTopColor: palette.border }]}
            >
              <Text style={[styles.label, { color: palette.muted }]}>{label}</Text>
              <Text style={[styles.value, { color: color || palette.text }]} selectable>{value}</Text>
            </View>
          ))}
        </Surface>
      ) : null}

      {resolution.network || resolution.address ? (
        <Surface mode={mode} style={styles.card}>
          {resolution.network ? (
            <View style={styles.row}>
              <Text style={[styles.label, { color: palette.muted }]}>Network</Text>
              <Text style={[styles.value, { color: palette.text }]}>{resolution.network}</Text>
            </View>
          ) : null}
          {resolution.address ? (
            <Text style={[styles.value, { color: palette.text }]} selectable>{resolution.address}</Text>
          ) : null}
        </Surface>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: uiTokens.space.md },
  header: { flexDirection: "row", alignItems: "center", gap: uiTokens.space.md },
  headerCopy: { flex: 1 },
  title: { fontSize: uiTokens.type.body + 2, fontWeight: "700" },
  message: { fontSize: uiTokens.type.label, marginTop: 2 },
  card: { borderRadius: uiTokens.radius.media, borderWidth: uiTokens.control.borderWidth, padding: uiTokens.space.lg },
  identity: { flexDirection: "row", alignItems: "center", gap: uiTokens.space.md },
  avatar: {
    width: 48, height: 48, borderRadius: uiTokens.radius.circle, borderWidth: uiTokens.control.borderWidth,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: uiTokens.type.body, fontWeight: "700" },
  identityCopy: { flex: 1, gap: 2 },
  name: { fontSize: uiTokens.type.body, fontWeight: "700" },
  meta: { fontSize: uiTokens.type.label },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    gap: uiTokens.space.md, paddingVertical: uiTokens.space.sm,
  },
  label: { fontSize: uiTokens.type.label },
  value: { fontSize: uiTokens.type.label, fontWeight: "600", flexShrink: 1, textAlign: "right" },
});
