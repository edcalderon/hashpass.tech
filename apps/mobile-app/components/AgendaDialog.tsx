import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconButton, ModalBackdrop } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { MaterialIcons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import type { AgendaDialogProps } from '../types/agenda-dialog.types';

/**
 * One dialog shell for every agenda confirmation and result: same scrim,
 * card, medallion, type scale and action row, so Add, Remove, Confirm and
 * Unconfirm read as one family. Colour is limited to the medallion and the
 * primary action.
 */
export default function AgendaDialog({
  visible,
  tone,
  icon,
  title,
  subtitle,
  children,
  actions,
  onClose,
  closeDisabled = false,
  testID,
}: AgendaDialogProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation('networking');
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  const hue = tone === 'success' ? palette.success : tone === 'danger' ? palette.danger : palette.accent;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ModalBackdrop mode={mode} testID={testID}>
        <Pressable
          accessible={false}
          style={StyleSheet.absoluteFill}
          onPress={closeDisabled ? undefined : onClose}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            { backgroundColor: palette.raised, borderColor: palette.border, boxShadow: uiTokens.effects.dialogShadow },
          ]}
        >
          {closeDisabled ? null : (
            <View style={styles.close}>
              <IconButton
                mode={mode}
                accentColor={palette.muted}
                size={36}
                label={t('mySchedule.close', 'Close')}
                onPress={onClose}
                testID={testID ? `${testID}-close` : undefined}
              >
                <MaterialIcons name="close" size={18} color={palette.muted} />
              </IconButton>
            </View>
          )}
          <View style={[styles.medallion, { backgroundColor: `${hue}1f`, borderColor: `${hue}55` }]}>
            <MaterialIcons name={icon as any} size={28} color={hue} />
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
          {children ? <View style={styles.body}>{children}</View> : null}
          <View style={styles.actions}>{actions}</View>
        </View>
      </ModalBackdrop>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: uiTokens.radius.card,
    borderWidth: uiTokens.control.borderWidth,
    maxWidth: 400,
    padding: uiTokens.space.xl,
    paddingTop: uiTokens.space.xxl,
    width: '100%',
  },
  close: { position: 'absolute', right: uiTokens.space.md, top: uiTokens.space.md, zIndex: 2 },
  medallion: {
    alignItems: 'center',
    borderRadius: uiTokens.radius.circle,
    borderWidth: uiTokens.control.borderWidth,
    height: 64,
    justifyContent: 'center',
    marginBottom: uiTokens.space.lg,
    width: 64,
  },
  title: { fontSize: 20, fontWeight: '700', lineHeight: 26, textAlign: 'center' },
  subtitle: {
    fontSize: uiTokens.type.label,
    lineHeight: 20,
    marginTop: uiTokens.space.xs,
    textAlign: 'center',
  },
  body: { alignSelf: 'stretch', gap: uiTokens.space.md, marginTop: uiTokens.space.lg },
  actions: { alignSelf: 'stretch', gap: uiTokens.space.sm, marginTop: uiTokens.space.xl },
});
