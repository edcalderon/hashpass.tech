import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type { AgendaTimeSlotProps } from '../types/agenda-timeline.types';

const GUTTER = 64;

/**
 * One calendar slot of the agenda: the session's start and end time sit in a left gutter
 * on a continuous rail, outside the card, and the card fills the rest. On the day of the
 * event a red line marks the current time, in the gap above a session or across the one
 * in progress.
 */
export default function AgendaTimeSlot({
  startLabel,
  endLabel,
  color,
  isDark = false,
  nowLine,
  testID,
  children,
}: AgendaTimeSlotProps) {
  const palette = uiPalette(isDark ? 'dark' : 'light');
  const nowColor = palette.danger;
  const line = (
    <View pointerEvents="none" style={styles.nowRow}>
      <View style={styles.nowGutter}>
        <Text style={[styles.nowLabel, { color: nowColor }]}>{nowLine?.label}</Text>
      </View>
      <View style={[styles.nowDot, { backgroundColor: nowColor }]} />
      <View style={[styles.nowRule, { backgroundColor: nowColor }]} />
    </View>
  );

  return (
    <View testID={testID}>
      {nowLine?.mode === 'before' ? <View testID="agenda-now-line" style={styles.nowInFlow}>{line}</View> : null}
      <View style={styles.slot}>
        <View style={[styles.gutter, { borderRightColor: palette.border }]}>
          {startLabel ? (
            <>
              <Text accessibilityLabel={endLabel ? `${startLabel} – ${endLabel}` : startLabel} style={[styles.start, { color: palette.text }]} numberOfLines={1}>
                {startLabel}
              </Text>
              {endLabel ? <Text style={[styles.end, { color: palette.muted }]} numberOfLines={1}>{endLabel}</Text> : null}
              <View style={[styles.marker, { backgroundColor: color, borderColor: palette.canvas }]} />
            </>
          ) : null}
        </View>
        <View style={styles.content}>{children}</View>
        {nowLine?.mode === 'within' ? (
          <View testID="agenda-now-line" style={[styles.nowOverlay, { top: `${Math.round((nowLine.fraction ?? 0) * 100)}%` }]}>
            {line}
          </View>
        ) : null}
      </View>
      {nowLine?.mode === 'after' ? <View testID="agenda-now-line" style={styles.nowInFlow}>{line}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { flexDirection: 'row', position: 'relative' },
  gutter: {
    alignItems: 'flex-end',
    borderRightWidth: uiTokens.control.borderWidth,
    paddingRight: uiTokens.space.sm + 2,
    paddingTop: uiTokens.space.xs + 2,
    position: 'relative',
    width: GUTTER,
  },
  start: { fontSize: uiTokens.type.caption, fontVariant: ['tabular-nums'], fontWeight: '800' },
  end: { fontSize: uiTokens.type.caption - 1, fontVariant: ['tabular-nums'], fontWeight: '600', marginTop: 1 },
  marker: {
    borderRadius: uiTokens.radius.circle,
    borderWidth: 2,
    height: 10,
    position: 'absolute',
    right: -6,
    top: uiTokens.space.sm,
    width: 10,
  },
  content: { flex: 1, minWidth: 0, paddingLeft: uiTokens.space.sm },
  nowInFlow: { height: 16, justifyContent: 'center' },
  nowOverlay: { left: 0, marginTop: -8, position: 'absolute', right: 0, zIndex: 6 },
  nowRow: { alignItems: 'center', flexDirection: 'row', height: 16 },
  nowGutter: { alignItems: 'flex-end', paddingRight: uiTokens.space.sm + 2, width: GUTTER },
  nowLabel: { fontSize: uiTokens.type.caption - 1, fontVariant: ['tabular-nums'], fontWeight: '800' },
  nowDot: { borderRadius: uiTokens.radius.circle, height: 10, marginLeft: -6, width: 10 },
  nowRule: { flex: 1, height: 2 },
});
