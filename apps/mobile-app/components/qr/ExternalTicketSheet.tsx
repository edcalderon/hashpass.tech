import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton, Badge, FilterChip, Surface } from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { upcomingTicketEvents } from "../../lib/external-ticket-qr";
import { reportExternalTicket, submitExternalTicketClaim } from "../../lib/external-ticket-claims";
import type { ExternalTicketClaimResult } from "../../types/ExternalTicketClaim.types";
import type { ExternalTicketSheetProps, ExternalTicketSheetPhase as Phase } from "../../types/qr-ui.types";

const PASS_TYPES = ["general", "business", "vip"] as const;

/**
 * Shown when a scan is an original (third-party) event ticket. The holder can
 * exchange it for a HASHPASS pass; each original ticket can be claimed once,
 * so a second person gets the "already claimed" state and may report it.
 */
export default function ExternalTicketSheet({ ticket, mode, onDone }: ExternalTicketSheetProps) {
  const palette = uiPalette(mode);
  // Only events that have not happened yet can be redeemed. A scan that hints
  // at a finished event falls back to the first upcoming one.
  const events = useMemo(() => upcomingTicketEvents(), []);
  const [eventId, setEventId] = useState<string>(
    events.find((event) => event.id === ticket.eventId)?.id ?? events[0]?.id ?? "",
  );
  const [passType, setPassType] = useState<(typeof PASS_TYPES)[number]>("general");
  const [phase, setPhase] = useState<Phase>("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [claim, setClaim] = useState<ExternalTicketClaimResult | null>(null);

  const reference = ticket.ticketCode ? `••••${ticket.ticketCode.slice(-4)}` : "Read from QR";
  const holder = ticket.metadata.holder;

  const create = async () => {
    if (!eventId) {
      setError(events.length ? "Choose the event this ticket is for." : "There are no upcoming events to redeem this ticket for.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await submitExternalTicketClaim({
        eventId,
        issuer: ticket.issuer,
        ticketCode: ticket.ticketCode,
        qrPayload: ticket.raw,
        requestedPassType: passType,
        ticketMetadata: ticket.metadata,
      });
      setClaim(result);
      setPhase("submitted");
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 409) setPhase("claimed-elsewhere");
      else setError(err instanceof Error ? err.message : "Unable to submit this ticket");
    } finally {
      setBusy(false);
    }
  };

  const report = async () => {
    setBusy(true);
    setError(null);
    try {
      await reportExternalTicket({
        eventId,
        issuer: ticket.issuer,
        ticketCode: ticket.ticketCode,
        qrPayload: ticket.raw,
        reason: "impersonation",
        details: details.trim() || undefined,
      });
      setPhase("reported");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit the report");
    } finally {
      setBusy(false);
    }
  };

  const statusCopy: Record<Exclude<Phase, "form" | "claimed-elsewhere">, { icon: "checkmark-circle" | "shield-checkmark"; title: string; body: string }> = {
    submitted: {
      icon: "checkmark-circle",
      title: claim?.status === "converted" ? "Your HASHPASS pass is ready" : "Approval request sent",
      body: claim?.status === "converted"
        ? "This ticket is now linked to your account."
        : "The event team has been notified and will check the original ticket, then your HASHPASS pass is created. This ticket is now reserved for your account.",
    },
    reported: {
      icon: "shield-checkmark",
      title: "Report received",
      body: "The event team will review this ticket and release it to its rightful holder if the claim was fraudulent.",
    },
  };

  if (phase === "submitted" || phase === "reported") {
    const copy = statusCopy[phase];
    return (
      <View style={styles.stack}>
        <View style={styles.header}>
          <Ionicons name={copy.icon} size={32} color={palette.success} />
          <View style={styles.headerCopy}>
            <Text style={[styles.title, { color: palette.text }]}>{copy.title}</Text>
            <Text style={[styles.message, { color: palette.muted }]}>{copy.body}</Text>
          </View>
        </View>
        <ActionButton mode={mode} variant="secondary" label="Scan another code" onPress={onDone} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={styles.header}>
        <Ionicons
          name={phase === "claimed-elsewhere" ? "alert-circle" : "ticket-outline"}
          size={32}
          color={phase === "claimed-elsewhere" ? palette.danger : palette.accent}
        />
        <View style={styles.headerCopy}>
          <Text style={[styles.title, { color: palette.text }]}>
            {phase === "claimed-elsewhere" ? "Ticket already claimed" : "Original event ticket"}
          </Text>
          <Text style={[styles.message, { color: palette.muted }]}>
            {phase === "claimed-elsewhere"
              ? "Another HASHPASS account already holds this ticket. Each original ticket works for one person only."
              : "Exchange it for an equivalent HASHPASS pass. Each original ticket can be claimed once."}
          </Text>
        </View>
      </View>

      <Surface mode={mode} style={styles.card}>
        <View style={styles.row}>
          <Text style={[styles.label, { color: palette.muted }]}>Issuer</Text>
          <Badge mode={mode} tone="neutral">{ticket.issuerLabel}</Badge>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: palette.muted }]}>Ticket</Text>
          <Text style={[styles.value, { color: palette.text }]}>{reference}</Text>
        </View>
        {holder ? (
          <View style={styles.row}>
            <Text style={[styles.label, { color: palette.muted }]}>Name on ticket</Text>
            <Text style={[styles.value, { color: palette.text }]} numberOfLines={1}>{holder}</Text>
          </View>
        ) : null}
        {ticket.metadata.ticketType ? (
          <View style={styles.row}>
            <Text style={[styles.label, { color: palette.muted }]}>Type</Text>
            <Text style={[styles.value, { color: palette.text }]}>{ticket.metadata.ticketType}</Text>
          </View>
        ) : null}
      </Surface>

      {phase === "form" ? (
        <>
          <View style={styles.group}>
            <Text style={[styles.label, { color: palette.muted }]}>Event</Text>
            <View style={styles.chips}>
              {events.map((event) => (
                <FilterChip
                  key={event.id}
                  mode={mode}
                  label={event.label}
                  selected={eventId === event.id}
                  onPress={() => setEventId(event.id)}
                />
              ))}
            </View>
          </View>
          <View style={styles.group}>
            <Text style={[styles.label, { color: palette.muted }]}>Pass on your ticket</Text>
            <View style={styles.chips}>
              {PASS_TYPES.map((type) => (
                <FilterChip
                  key={type}
                  mode={mode}
                  label={type.charAt(0).toUpperCase() + type.slice(1)}
                  selected={passType === type}
                  onPress={() => setPassType(type)}
                />
              ))}
            </View>
          </View>
          {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
          <ActionButton mode={mode} label="Create my HASHPASS pass" loading={busy} onPress={create} />
          <ActionButton mode={mode} variant="ghost" label="Scan another code" onPress={onDone} />
        </>
      ) : (
        <>
          <View style={styles.group}>
            <Text style={[styles.label, { color: palette.muted }]}>
              Is this your ticket? Tell the event team what happened.
            </Text>
            <TextInput
              value={details}
              onChangeText={setDetails}
              placeholder="Optional details, such as where you bought it"
              placeholderTextColor={palette.muted}
              multiline
              maxLength={1000}
              accessibilityLabel="Report details"
              style={[styles.input, { color: palette.text, backgroundColor: palette.raised, borderColor: palette.border }]}
            />
          </View>
          {error ? <Text style={[styles.error, { color: palette.danger }]}>{error}</Text> : null}
          <ActionButton
            mode={mode}
            label="Report ticket misuse"
            leadingIcon={<Ionicons name="flag-outline" size={18} color={palette.onAccent} />}
            loading={busy}
            onPress={report}
          />
          <ActionButton mode={mode} variant="ghost" label="Scan another code" onPress={onDone} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: uiTokens.space.md },
  header: { flexDirection: "row", alignItems: "flex-start", gap: uiTokens.space.md },
  headerCopy: { flex: 1 },
  title: { fontSize: uiTokens.type.body + 2, fontWeight: "700" },
  message: { fontSize: uiTokens.type.label, marginTop: 2, lineHeight: 20 },
  card: { borderRadius: uiTokens.radius.media, borderWidth: uiTokens.control.borderWidth, padding: uiTokens.space.lg, gap: uiTokens.space.sm },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: uiTokens.space.md },
  group: { gap: uiTokens.space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: uiTokens.space.sm },
  label: { fontSize: uiTokens.type.label },
  value: { fontSize: uiTokens.type.label, fontWeight: "600", flexShrink: 1, textAlign: "right" },
  error: { fontSize: uiTokens.type.label },
  input: {
    minHeight: 88, borderWidth: uiTokens.control.borderWidth, borderRadius: uiTokens.radius.input,
    padding: uiTokens.space.md, fontSize: uiTokens.type.body, textAlignVertical: "top",
  },
});
