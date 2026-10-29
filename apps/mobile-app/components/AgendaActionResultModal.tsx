import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionButton } from '@hashpass/ui/primitives';
import { uiPalette } from '@hashpass/ui/tokens';
import { MaterialIcons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import AgendaDialog from './AgendaDialog';

type AgendaActionResultModalProps = {
  visible: boolean;
  /** true = just confirmed/added, false = just unconfirmed/removed. */
  added: boolean;
  onClose: () => void;
  onViewAgenda: () => void;
};

/**
 * Confirmation feedback for the agenda confirm/unconfirm action — a real
 * modal with a "Check your agenda" link, not just a toast that can be
 * missed or that leaves the user unsure whether the action actually landed
 * (see the my-schedule.tsx registryUserId fix in the same change for the
 * real bug this was covering for: a confirmed slot could silently show as
 * still-free on the My Agenda screen). Shown for both directions (confirm
 * and unconfirm) so the link to verify is available either way.
 */
export default function AgendaActionResultModal({
  visible,
  added,
  onClose,
  onViewAgenda,
}: AgendaActionResultModalProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation('networking');
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);

  return (
    <AgendaDialog
      visible={visible}
      tone={added ? 'success' : 'accent'}
      icon={added ? 'check-circle' : 'event-busy'}
      title={added
        ? t('messages.addedToAgenda', 'Added to agenda')
        : t('messages.removedFromAgenda', 'Removed from agenda')}
      subtitle={added
        ? t('messages.addedToAgendaMessage', 'This session is now in your agenda')
        : t('messages.removedFromAgendaMessage', 'This session was removed from your agenda')}
      onClose={onClose}
      testID="agenda-action-result"
      actions={(
        <View style={styles.row}>
          <ActionButton
            mode={mode}
            variant="secondary"
            label={t('mySchedule.close', 'Close')}
            onPress={onClose}
            style={styles.half}
            skin={{ fill: palette.accentFill, onFill: palette.onAccent, accent: palette.text, soft: palette.surface, border: palette.border }}
          />
          <ActionButton
            mode={mode}
            label={t('mySchedule.checkYourAgenda', 'Check your agenda')}
            leadingIcon={<MaterialIcons name="event" size={18} color={palette.onAccent} />}
            onPress={onViewAgenda}
            style={styles.wide}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: { alignSelf: 'stretch', flexDirection: 'row', gap: 8 },
  half: { alignSelf: 'stretch', flex: 1 },
  wide: { alignSelf: 'stretch', flex: 2 },
});
