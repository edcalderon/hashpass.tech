import React from 'react';
import { FormField } from '@hashpass/ui/primitives';
import type { NotificationDateTimeFieldProps } from '../../types/NotificationDateTimeField.types';

export default function NotificationDateTimeField({
  mode,
  label,
  value,
  onChangeText,
  accessibilityHint,
}: NotificationDateTimeFieldProps) {
  return (
    <FormField
      mode={mode}
      label={label}
      value={value}
      onChangeText={onChangeText}
      accessibilityHint={accessibilityHint}
      webInputType="datetime-local"
      webInputStep={60}
      autoCapitalize="none"
      autoCorrect={false}
    />
  );
}
