import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActionButton, Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { useTheme } from "../../../hooks/useTheme";
import { apiClient } from "../../../lib/api-client";

export default function TransferConfirmationScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { isDark } = useTheme();
  const mode = isDark ? "dark" : "light";
  const palette = uiPalette(mode);
  const [state, setState] = useState<"ready" | "confirming" | "confirmed" | "completed" | "error">("ready");
  const [message, setMessage] = useState("Both people must confirm by email before the pass changes ownership.");

  useEffect(() => {
    if (!token || Array.isArray(token)) {
      setState("error");
      setMessage("This confirmation link is incomplete.");
    }
  }, [token]);

  const confirm = async () => {
    const value = Array.isArray(token) ? token[0] : token;
    if (!value || state === "confirming") return;
    setState("confirming");
    const response = await apiClient.post(
      "/pass-transfers",
      { action: "confirm", token: value },
      { skipAuth: true, skipEventSegment: true },
    );
    if (!response.success) {
      setState("error");
      setMessage(response.error || "This transfer confirmation is no longer available.");
      return;
    }
    const result = response.data?.data || response.data;
    setState(result?.status === "completed" ? "completed" : "confirmed");
    setMessage(
      result?.status === "completed"
        ? "Transfer complete. The pass now belongs to the recipient."
        : "Your confirmation was recorded. The other person must confirm before ownership changes.",
    );
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: uiTokens.space.lg, backgroundColor: palette.canvas }}>
      <Surface mode={mode} style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: uiTokens.space.md }}>
        <Text style={{ color: palette.text, fontSize: uiTokens.type.title, fontWeight: "800" }}>Confirm ticket transfer</Text>
        <Text style={{ color: palette.muted, lineHeight: 20 }}>{message}</Text>
        {state === "ready" || state === "confirming" ? (
          <ActionButton mode={mode} label={state === "confirming" ? "Confirming…" : "Confirm transfer"} onPress={() => void confirm()} loading={state === "confirming"} leadingIcon={state === "confirming" ? <ActivityIndicator color={palette.onAccent} size="small" /> : undefined} />
        ) : (
          <ActionButton mode={mode} variant="secondary" label="Back to HASHPASS" onPress={() => router.replace("/(shared)/dashboard/wallet" as any)} />
        )}
        {state === "error" ? <Text style={{ color: palette.danger, fontSize: 12 }}>{message}</Text> : null}
      </Surface>
    </View>
  );
}
