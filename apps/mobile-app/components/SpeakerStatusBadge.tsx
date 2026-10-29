import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '../lib/vector-icons';
import { useTranslation } from '../i18n/i18n';
import { Badge } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type {
  SpeakerBadgeStatus,
  SpeakerStatusBadgeProps,
} from '../types/speaker-status-badge.types';
export type { SpeakerBadgeStatus } from '../types/speaker-status-badge.types';

// Statuses that are "live" ping; a switched-off or past profile stays still.
const ICONS: Record<SpeakerBadgeStatus, string> = {
  active: 'verified',
  passive: 'hourglass-empty',
  dnd: 'notifications-off',
  inactive: 'pause-circle-outline',
  past: 'history',
};
const ORDER: SpeakerBadgeStatus[] = ['active', 'passive', 'dnd'];

/** Status pill; pressing it opens a modal that explains every speaker status. */
export default function SpeakerStatusBadge({ status, label, isDark = false }: SpeakerStatusBadgeProps) {
  const { t } = useTranslation('networking');
  const [open, setOpen] = useState(false);
  const text = label ?? t(`speakerView.status.${status}.label`);
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  const hues = uiTokens.speakerStatus[mode];
  const hue = hues[status];
  const surface = palette.raised;
  const primary = palette.text;
  const secondary = palette.muted;

  return (
    <>
      <Badge
        mode={mode}
        tone="neutral"
        tint={hue}
        accessibilityLabel={t('speakerView.status.explainA11y', { status: text })}
        onPress={() => setOpen(true)}
        badgeTestID={`speaker-status-${status}`}
        trailingIcon={status === 'active'
          ? <MaterialIcons name="check" size={14} color={hue} />
          : <MaterialIcons name="info-outline" size={12} color={palette.muted} />}
      >
        {text}
      </Badge>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.overlay, { backgroundColor: palette.overlay }]} onPress={() => setOpen(false)} accessibilityLabel={t('speakerView.status.close')}>
          <Pressable style={[styles.card, { backgroundColor: surface, borderColor: palette.border }]} onPress={() => undefined}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: primary }]}>{t('speakerView.status.title')}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('speakerView.status.close')}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                onPress={() => setOpen(false)}
              >
                <MaterialIcons name="close" size={22} color={primary} />
              </TouchableOpacity>
            </View>
            {ORDER.map((key) => (
              <View key={key} style={[styles.row, key === status && { backgroundColor: palette.accentSoft }]}>
                <View style={[styles.rowIcon, { backgroundColor: `${hues[key]}26` }]}>
                  <MaterialIcons name={ICONS[key] as any} size={16} color={hues[key]} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: primary }]}>{t(`speakerView.status.${key}.label`)}</Text>
                  <Text style={[styles.rowText, { color: secondary }]}>{t(`speakerView.status.${key}.description`)}</Text>
                </View>
              </View>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: { borderRadius: uiTokens.radius.media, borderWidth: uiTokens.control.borderWidth, padding: 20, gap: 14, maxWidth: 460, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: uiTokens.radius.input },
  rowIcon: { width: 28, height: 28, borderRadius: uiTokens.radius.circle, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowText: { fontSize: 13, lineHeight: 18 },
});
