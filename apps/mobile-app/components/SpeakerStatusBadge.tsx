import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '../lib/vector-icons';
import { useTranslation } from '../i18n/i18n';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type {
  SpeakerBadgeStatus,
  SpeakerStatusBadgeProps,
} from '../types/speaker-status-badge.types';
export type { SpeakerBadgeStatus } from '../types/speaker-status-badge.types';

const TONES: Record<SpeakerBadgeStatus, { bg: string; fg: string; icon: string }> = {
  active: { bg: '#34A853', fg: '#FFFFFF', icon: 'verified' },
  passive: { bg: '#2563EB', fg: '#FFFFFF', icon: 'hourglass-empty' },
  dnd: { bg: '#6366F1', fg: '#FFFFFF', icon: 'notifications-off' },
  inactive: { bg: '#6B7280', fg: '#FFFFFF', icon: 'pause-circle-outline' },
  past: { bg: '#6B7280', fg: '#FFFFFF', icon: 'history' },
};

const ORDER: SpeakerBadgeStatus[] = ['active', 'passive', 'dnd'];

/** Status pill; pressing it opens a modal that explains every speaker status. */
export default function SpeakerStatusBadge({ status, label, isDark = false }: SpeakerStatusBadgeProps) {
  const { t } = useTranslation('networking');
  const [open, setOpen] = useState(false);
  const tone = TONES[status];
  const text = label ?? t(`speakerView.status.${status}.label`);
  const palette = uiPalette(isDark ? 'dark' : 'light');
  const surface = palette.raised;
  const primary = palette.text;
  const secondary = palette.muted;

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('speakerView.status.explainA11y', { status: text })}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        onPress={() => setOpen(true)}
        style={[styles.badge, { backgroundColor: tone.bg }]}
        testID={`speaker-status-${status}`}
      >
        <Text style={[styles.badgeText, { color: tone.fg }]}>{text}</Text>
        <MaterialIcons name="info-outline" size={12} color={tone.fg} />
      </TouchableOpacity>

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
                <View style={[styles.rowIcon, { backgroundColor: TONES[key].bg }]}>
                  <MaterialIcons name={TONES[key].icon as any} size={16} color={TONES[key].fg} />
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: uiTokens.radius.small,
  },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
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
