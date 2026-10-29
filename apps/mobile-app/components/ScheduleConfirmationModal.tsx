import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { MaterialIcons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { DEFAULT_EVENT_TZ_OFFSET, formatEventClock } from '../lib/event-time';
import { useTranslation } from '../i18n/i18n';
import AgendaDialog from './AgendaDialog';

interface ScheduleConfirmationModalProps {
  visible: boolean;
  title: string;
  location?: string;
  startTime: Date;
  isConfirmed: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isFreeSlot?: boolean;
  freeSlotStatus?: 'available' | 'interested' | 'blocked' | 'tentative';
  isAgendaEvent?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onToggleBlocked?: () => void;
  /** Shown as a "check your agenda first" link before the unconfirm action, so people can verify what's actually on their schedule before removing something from it. */
  onViewAgenda?: () => void;
  /**
   * The event's own fixed UTC offset (e.g. "-04:00" for Chile), from
   * lib/event-time.ts's getEventTzOffset(event.eventStartDate). startTime is
   * always displayed in this offset, never the viewer's device timezone —
   * defaults to DEFAULT_EVENT_TZ_OFFSET only as a last resort for callers
   * that haven't been updated to pass it.
   */
  eventTzOffset?: string;
}

export default function ScheduleConfirmationModal({
  visible,
  title,
  location,
  startTime,
  isConfirmed,
  onConfirm,
  onCancel,
  isLoading = false,
  isFreeSlot = false,
  freeSlotStatus = 'available',
  isAgendaEvent = false,
  eventTzOffset = DEFAULT_EVENT_TZ_OFFSET,
  isFavorite = false,
  onToggleFavorite,
  onToggleBlocked,
  onViewAgenda,
}: ScheduleConfirmationModalProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation('networking');
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  // Destructive actions keep the shared button geometry with the danger hue.
  const dangerSkin = { fill: palette.danger, onFill: palette.canvas, accent: palette.danger, soft: palette.surface, border: palette.border };
  const neutralSkin = { fill: palette.accentFill, onFill: palette.onAccent, accent: palette.text, soft: palette.surface, border: palette.border };

  const translateKey = (value?: string) => {
    if (value?.startsWith('networking.')) {
      const key = value.replace('networking.', '');
      const translated = t(key);
      return translated !== `networking.${key}` ? translated : value;
    }
    return value;
  };

  const infoRow = (icon: string, text: string, key: string) => (
    <View key={key} style={styles.infoRow}>
      <MaterialIcons name={icon as any} size={16} color={palette.muted} />
      <Text style={[styles.infoText, { color: palette.muted }]} numberOfLines={2}>{text}</Text>
    </View>
  );

  const cancelButton = (
    <ActionButton
      mode={mode}
      variant="secondary"
      skin={neutralSkin}
      label={t('mySchedule.cancel', 'Cancel')}
      onPress={onCancel}
      disabled={isLoading}
      style={styles.half}
    />
  );

  if (isFreeSlot) {
    const isInterested = freeSlotStatus === 'interested';
    const isBlocked = freeSlotStatus === 'blocked';
    const subtitle = isBlocked
      ? t('mySchedule.freeSlot.blockedMessage')
      : isInterested
        ? t('mySchedule.freeSlot.interestedMessage')
        : t('mySchedule.freeSlot.availableMessage');
    const heading = isBlocked
      ? t('mySchedule.freeSlot.unblockSlot')
      : isInterested
        ? t('mySchedule.freeSlot.removeInterest')
        : t('mySchedule.freeSlot.markFreeSlot');

    return (
      <AgendaDialog
        visible={visible}
        tone={isBlocked ? 'danger' : isInterested ? 'accent' : 'success'}
        icon={isBlocked ? 'block' : isInterested ? 'favorite' : 'schedule'}
        title={heading}
        subtitle={subtitle}
        onClose={onCancel}
        closeDisabled={isLoading}
        testID="schedule-free-slot-dialog"
        actions={!isBlocked && !isInterested ? (
          <>
            <ActionButton
              mode={mode}
              label={t('mySchedule.freeSlot.interested')}
              leadingIcon={<MaterialIcons name="favorite" size={18} color={palette.onAccent} />}
              onPress={onConfirm}
              disabled={isLoading}
              style={styles.full}
            />
            <ActionButton
              mode={mode}
              variant="secondary"
              skin={dangerSkin}
              label={t('mySchedule.freeSlot.block')}
              leadingIcon={<MaterialIcons name="block" size={18} color={palette.danger} />}
              onPress={() => onToggleBlocked && onToggleBlocked()}
              disabled={isLoading}
              style={styles.full}
            />
          </>
        ) : (
          <View style={styles.row}>
            {cancelButton}
            <ActionButton
              mode={mode}
              skin={isBlocked ? dangerSkin : undefined}
              label={isLoading
                ? (isBlocked ? t('mySchedule.freeSlot.unblocking') : t('mySchedule.freeSlot.removing'))
                : (isBlocked ? t('mySchedule.freeSlot.unblock') : t('mySchedule.freeSlot.remove'))}
              leadingIcon={<MaterialIcons name={isBlocked ? 'block' : 'favorite-border'} size={18} color={isBlocked ? palette.canvas : palette.onAccent} />}
              onPress={onConfirm}
              loading={isLoading}
              style={styles.wide}
            />
          </View>
        )}
      >
        <View style={[styles.details, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Text style={[styles.detailsTitle, { color: palette.text }]}>{t('mySchedule.freeSlot.freeSlotAvailable')}</Text>
          {infoRow('schedule', formatEventClock(startTime, eventTzOffset), 'time')}
        </View>
      </AgendaDialog>
    );
  }

  const resolvedLocation = translateKey(location);
  return (
    <AgendaDialog
      visible={visible}
      tone={isConfirmed ? 'danger' : 'success'}
      icon={isConfirmed ? 'event-busy' : 'event'}
      title={isConfirmed ? t('mySchedule.unconfirmAttendance') : t('mySchedule.confirmAttendance')}
      subtitle={isConfirmed ? t('mySchedule.unconfirmMessage') : t('mySchedule.confirmMessage')}
      onClose={onCancel}
      closeDisabled={isLoading}
      testID="schedule-confirmation-dialog"
      actions={(
        <>
          <View style={styles.row}>
            {cancelButton}
            <ActionButton
              mode={mode}
              skin={isConfirmed ? dangerSkin : undefined}
              label={isLoading
                ? (isConfirmed ? t('mySchedule.unconfirming') : t('mySchedule.confirming'))
                : (isConfirmed ? t('mySchedule.unconfirm') : t('mySchedule.confirm'))}
              leadingIcon={(
                <MaterialIcons
                  name={isConfirmed ? 'remove-circle-outline' : 'check'}
                  size={18}
                  color={isConfirmed ? palette.canvas : palette.onAccent}
                />
              )}
              onPress={onConfirm}
              loading={isLoading}
              style={styles.wide}
            />
          </View>
          {isConfirmed && onViewAgenda ? (
            <ActionButton
              mode={mode}
              variant="ghost"
              skin={neutralSkin}
              label={t('mySchedule.checkAgendaFirst', 'Check your agenda first')}
              leadingIcon={<MaterialIcons name="event" size={18} color={palette.text} />}
              onPress={onViewAgenda}
              disabled={isLoading}
              style={styles.full}
            />
          ) : null}
        </>
      )}
    >
      <View style={[styles.details, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.detailsTitle, { color: palette.text }]} numberOfLines={3}>{translateKey(title)}</Text>
        {infoRow('schedule', formatEventClock(startTime, eventTzOffset), 'time')}
        {resolvedLocation ? infoRow('location-on', resolvedLocation, 'location') : null}
      </View>
      {isAgendaEvent && onToggleFavorite ? (
        <ActionButton
          mode={mode}
          variant="secondary"
          skin={neutralSkin}
          label={isFavorite ? t('mySchedule.bookmarked', 'Bookmarked') : t('mySchedule.bookmark', 'Bookmark')}
          leadingIcon={(
            <MaterialIcons
              name={isFavorite ? 'bookmark' : 'bookmark-border'}
              size={18}
              color={isFavorite ? palette.danger : palette.muted}
            />
          )}
          accessibilityState={{ selected: isFavorite }}
          onPress={onToggleFavorite}
          disabled={isLoading}
          style={styles.full}
        />
      ) : null}
    </AgendaDialog>
  );
}

const styles = StyleSheet.create({
  row: { alignSelf: 'stretch', flexDirection: 'row', gap: uiTokens.space.sm },
  half: { alignSelf: 'stretch', flex: 1 },
  wide: { alignSelf: 'stretch', flex: 2 },
  full: { alignSelf: 'stretch' },
  details: {
    borderRadius: uiTokens.radius.media,
    borderWidth: uiTokens.control.borderWidth,
    gap: uiTokens.space.sm,
    padding: uiTokens.space.lg,
  },
  detailsTitle: { fontSize: uiTokens.type.body, fontWeight: '700', lineHeight: 22 },
  infoRow: { alignItems: 'center', flexDirection: 'row', gap: uiTokens.space.sm },
  infoText: { flex: 1, fontSize: uiTokens.type.label, lineHeight: 20 },
});
