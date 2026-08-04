import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';

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
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('networking');
  const styles = getStyles(isDark, colors);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.dialog}>
          <View style={[styles.iconWrap, { backgroundColor: added ? '#16a34a22' : `${colors.primary}22` }]}>
            <MaterialIcons
              name={added ? 'check-circle' : 'event-busy'}
              size={30}
              color={added ? '#16a34a' : colors.primary}
            />
          </View>

          <Text style={styles.title}>
            {added
              ? t('messages.addedToAgenda', 'Added to agenda')
              : t('messages.removedFromAgenda', 'Removed from agenda')}
          </Text>
          <Text style={styles.subtitle}>
            {added
              ? t('messages.addedToAgendaMessage', 'This session is now in your agenda')
              : t('messages.removedFromAgendaMessage', 'This session was removed from your agenda')}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>{t('mySchedule.close', 'Close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.viewAgendaButton, { backgroundColor: colors.primary }]} onPress={onViewAgenda}>
              <MaterialIcons name="event" size={16} color="#ffffff" />
              <Text style={styles.viewAgendaButtonText}>{t('mySchedule.checkYourAgenda', 'Check your agenda')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    dialog: {
      backgroundColor: colors.background.paper,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 6,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 22,
      lineHeight: 20,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
    },
    closeButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    viewAgendaButton: {
      flex: 2,
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    viewAgendaButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#ffffff',
    },
  });
