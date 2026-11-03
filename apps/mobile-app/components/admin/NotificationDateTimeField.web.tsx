import React, { useId, useState } from 'react';
import { Text, View } from 'react-native';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type { NotificationDateTimeFieldProps } from '../../types/NotificationDateTimeField.types';

export default function NotificationDateTimeField({
  mode,
  label,
  value,
  onChangeText,
  accessibilityHint,
}: NotificationDateTimeFieldProps) {
  const palette = uiPalette(mode);
  const inputId = useId();
  const [focused, setFocused] = useState(false);

  return (
    <View style={{ gap: uiTokens.space.sm }}>
      <Text nativeID={`${inputId}-label`} style={{ color: palette.text, fontSize: uiTokens.type.label, lineHeight: 20, fontWeight: '600' }}>
        {label}
      </Text>
      {React.createElement('input', {
        id: inputId,
        type: 'datetime-local',
        step: 60,
        value,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChangeText(event.currentTarget.value),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        'aria-label': label,
        'aria-describedby': `${inputId}-hint`,
        title: accessibilityHint,
        style: {
          boxSizing: 'border-box',
          width: '100%',
          minHeight: uiTokens.control.minHeight,
          border: `${uiTokens.control.borderWidth}px solid ${focused ? palette.accent : palette.border}`,
          borderRadius: uiTokens.radius.input,
          padding: `${uiTokens.space.md}px ${uiTokens.space.lg}px`,
          backgroundColor: palette.raised,
          color: palette.text,
          colorScheme: mode,
          fontFamily: 'inherit',
          fontSize: uiTokens.type.body,
          outlineOffset: 2,
        } as React.CSSProperties,
      })}
      <Text nativeID={`${inputId}-hint`} style={{ display: 'none' }}>
        {accessibilityHint}
      </Text>
    </View>
  );
}
