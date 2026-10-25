import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialIcons } from "../../../lib/vector-icons";
import { Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { useTheme } from "../../../hooks/useTheme";
import { apiClient } from "../../../lib/api-client";
import type { PublicPassDetails } from "../../../types/PassShareModal.types";

export default function PublicPassScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { isDark } = useTheme();
  const mode = isDark ? "dark" : "light";
  const palette = uiPalette(mode);
  const [pass, setPass] = useState<PublicPassDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const value = Array.isArray(token) ? token[0] : token;
    if (!value) {
      setError("This public pass link is incomplete.");
      setLoading(false);
      return () => { active = false; };
    }
    void apiClient
      .get("/pass-shares", { skipAuth: true, skipEventSegment: true, params: { token: value } })
      .then((response: { success: boolean; data?: unknown; error?: string }) => {
        if (!active) return;
        if (!response.success) setError(response.error || "This public pass link is no longer available.");
        else setPass((response.data as any)?.data || response.data || null);
      })
      .catch(() => {
        if (active) setError("This public pass link is no longer available.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: uiTokens.space.lg, justifyContent: "center", backgroundColor: palette.canvas }}>
      <Surface mode={mode} style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: uiTokens.space.md }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={10}>
          <MaterialIcons name="arrow-back" size={22} color={palette.text} />
        </Pressable>
        {loading ? (
          <ActivityIndicator color={palette.accent} />
        ) : error ? (
          <View style={{ gap: uiTokens.space.xs }}>
            <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: "800" }}>Public pass unavailable</Text>
            <Text style={{ color: palette.muted, lineHeight: 20 }}>{error}</Text>
          </View>
        ) : pass ? (
          <View style={{ gap: uiTokens.space.sm }}>
            <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: "800" }}>Public pass details</Text>
            <Text style={{ color: palette.muted, lineHeight: 20 }}>Event: {pass.eventId}</Text>
            <Text style={{ color: palette.muted, lineHeight: 20 }}>Pass type: {String(pass.passType || "event").toUpperCase()}</Text>
            <Text style={{ color: palette.accent, fontWeight: "700" }}>Status: {String(pass.status || "active").toUpperCase()}</Text>
            <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18 }}>This page intentionally does not display the pass number or admission QR.</Text>
          </View>
        ) : null}
      </Surface>
    </ScrollView>
  );
}
