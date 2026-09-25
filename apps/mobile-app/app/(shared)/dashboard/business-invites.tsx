import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton, ModalBackdrop, Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { apiClient } from "../../../lib/api-client";
import { useScroll } from "@contexts/ScrollContext";
import { useTheme } from "../../../hooks/useTheme";
import { useTranslation } from "../../../i18n/i18n";

type BusinessInviteRequest = {
  id: string;
  user_id: string;
  user_email: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
};

type ApiEnvelope = { success?: boolean; data?: unknown; error?: string };

const responseItems = (response: unknown): BusinessInviteRequest[] => {
  const data =
    response && typeof response === "object" && "data" in response
      ? (response as { data?: unknown }).data
      : response;
  const items =
    data && typeof data === "object" && "items" in data
      ? (data as { items?: unknown }).items
      : null;
  return Array.isArray(items) ? (items as BusinessInviteRequest[]) : [];
};

export default function BusinessInviteApprovalScreen() {
  const { isDark } = useTheme();
  const { headerHeight } = useScroll();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation("passes");
  const mode = isDark ? "dark" : "light";
  const palette = uiPalette(mode);
  const [requests, setRequests] = useState<BusinessInviteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BusinessInviteRequest | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = (await apiClient.get("/admin/business-invites", {
        skipEventSegment: true,
        params: { status: "pending", limit: "100" },
      })) as ApiEnvelope;
      if (response.success === false)
        throw new Error(response.error || "Request failed");
      setRequests(responseItems(response));
    } catch {
      setError(
        t(
          "businessInvite.approval.loadError",
          "Unable to load Business access requests. Confirm you have review access and try again.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const review = useCallback(
    async (decision: "approve" | "reject") => {
      if (!selected || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const response = (await apiClient.post(
          "/admin/business-invites",
          { requestId: selected.id, decision },
          { skipEventSegment: true },
        )) as ApiEnvelope;
        if (response.success === false)
          throw new Error(response.error || "Request failed");
        setRequests((current) =>
          current.filter((request) => request.id !== selected.id),
        );
        setSelected(null);
      } catch {
        setError(
          t(
            "businessInvite.approval.reviewError",
            "The request could not be reviewed. No Business access was changed.",
          ),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [selected, submitting, t],
  );

  return (
    <ScrollView
      style={[styles.page, { backgroundColor: palette.canvas }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop:
            Math.max(headerHeight, insets.top + 80) + uiTokens.space.xl,
          paddingBottom: insets.bottom + uiTokens.space.section,
        },
      ]}
    >
      <View style={styles.heading}>
        <Text style={[styles.eyebrow, { color: palette.accent }]}>
          {t("businessInvite.approval.eyebrow", "BUSINESS ACCESS")}
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: palette.text }]}
        >
          {t(
            "businessInvite.approval.title",
            "Review Business access requests",
          )}
        </Text>
        <Text style={[styles.body, { color: palette.muted }]}>
          {t(
            "businessInvite.approval.description",
            "Approve only attendees you recognize. Approval activates Business access for BSL and Colombia Blockchain Week.",
          )}
        </Text>
      </View>

      {error && (
        <Surface mode={mode} accessibilityRole="alert" style={styles.error}>
          <Text style={{ color: palette.danger }}>{error}</Text>
        </Surface>
      )}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
          <Text style={{ color: palette.muted }}>
            {t("businessInvite.approval.loading", "Loading requests…")}
          </Text>
        </View>
      ) : requests.length === 0 ? (
        <Surface mode={mode} style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: palette.text }]}>
            {t("businessInvite.approval.emptyTitle", "No pending requests")}
          </Text>
          <Text style={[styles.body, { color: palette.muted }]}>
            {t(
              "businessInvite.approval.emptyMessage",
              "New verified requests will appear here and in your notifications.",
            )}
          </Text>
          <ActionButton
            mode={mode}
            variant="secondary"
            label={t("businessInvite.approval.refresh", "Refresh")}
            onPress={() => void loadRequests()}
          />
        </Surface>
      ) : (
        <View style={styles.requests}>
          {requests.map((request) => (
            <Surface key={request.id} mode={mode} style={styles.request}>
              <View style={styles.requestText}>
                <Text style={[styles.email, { color: palette.text }]}>
                  {request.user_email}
                </Text>
                <Text style={[styles.body, { color: palette.muted }]}>
                  {t("businessInvite.approval.requested", "Requested")}{" "}
                  {new Date(request.requested_at).toLocaleString()}
                </Text>
              </View>
              <ActionButton
                mode={mode}
                variant="secondary"
                label={t("businessInvite.approval.review", "Review")}
                onPress={() => setSelected(request)}
              />
            </Surface>
          ))}
        </View>
      )}

      <Modal
        visible={Boolean(selected)}
        transparent
        animationType="fade"
        onRequestClose={() => !submitting && setSelected(null)}
        accessibilityViewIsModal
      >
        <ModalBackdrop mode={mode}>
          {selected && (
            <Surface
              mode={mode}
              style={[styles.dialog, { shadowColor: palette.text }]}
              accessibilityRole="alert"
              accessibilityLabel={t(
                "businessInvite.approval.confirmTitle",
                "Confirm Business access decision",
              )}
            >
              <Text style={[styles.dialogTitle, { color: palette.text }]}>
                {t(
                  "businessInvite.approval.confirmTitle",
                  "Confirm Business access decision",
                )}
              </Text>
              <Text style={[styles.body, { color: palette.muted }]}>
                {t(
                  "businessInvite.approval.confirmMessage",
                  "This decision is recorded and the user is notified by email and in the app.",
                )}
              </Text>
              <Text style={[styles.email, { color: palette.text }]}>
                {selected.user_email}
              </Text>
              <View style={styles.actions}>
                <ActionButton
                  mode={mode}
                  variant="ghost"
                  label={t("businessInvite.close", "Close")}
                  disabled={submitting}
                  onPress={() => setSelected(null)}
                />
                <ActionButton
                  mode={mode}
                  variant="secondary"
                  label={t("businessInvite.approval.reject", "Reject")}
                  loading={submitting}
                  onPress={() => void review("reject")}
                />
                <ActionButton
                  mode={mode}
                  label={t(
                    "businessInvite.approval.approve",
                    "Approve Business access",
                  )}
                  loading={submitting}
                  onPress={() => void review("approve")}
                />
              </View>
            </Surface>
          )}
        </ModalBackdrop>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 880,
    alignSelf: "center",
    paddingHorizontal: uiTokens.space.lg,
    gap: uiTokens.space.xl,
  },
  heading: { gap: uiTokens.space.sm },
  eyebrow: {
    fontSize: uiTokens.type.caption,
    fontWeight: "700",
    letterSpacing: 1.4,
  },
  title: { fontSize: uiTokens.type.heading, lineHeight: 40, fontWeight: "700" },
  body: { fontSize: uiTokens.type.body, lineHeight: 24 },
  error: { padding: uiTokens.space.lg },
  loading: {
    minHeight: 160,
    gap: uiTokens.space.md,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { gap: uiTokens.space.md, alignItems: "flex-start" },
  emptyTitle: { fontSize: uiTokens.type.title, fontWeight: "700" },
  requests: { gap: uiTokens.space.md },
  request: {
    gap: uiTokens.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  requestText: { flex: 1, minWidth: 0, gap: uiTokens.space.xs },
  email: { fontSize: uiTokens.type.body, lineHeight: 24, fontWeight: "600" },
  dialog: {
    width: "100%",
    maxWidth: 520,
    gap: uiTokens.space.lg,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 36,
    elevation: 14,
  },
  dialogTitle: {
    fontSize: uiTokens.type.title,
    lineHeight: 30,
    fontWeight: "700",
  },
  actions: {
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: uiTokens.space.sm,
  },
});
