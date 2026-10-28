import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { LukasWhyVideoProps } from '../../types/lukas.types';

const copy: Record<string, { label: string; detail: string }> = {
  en: { label: 'How LUKAS stays stable', detail: 'One regional index, five local currencies.' },
  es: { label: 'Cómo LUKAS mantiene su estabilidad', detail: 'Un índice regional, cinco monedas locales.' },
  ko: { label: 'LUKAS가 안정적인 이유', detail: '하나의 지역 지수, 다섯 개의 현지 통화.' },
  fr: { label: 'Comment LUKAS reste stable', detail: 'Un indice régional, cinq monnaies locales.' },
  pt: { label: 'Como LUKAS se mantém estável', detail: 'Um índice regional, cinco moedas locais.' },
  de: { label: 'Wie LUKAS stabil bleibt', detail: 'Ein regionaler Index, fünf lokale Währungen.' },
};

export function LukasWhyVideo({locale, isDark}: LukasWhyVideoProps) {
  const selected = copy[locale.toLowerCase().split('-')[0]] ?? copy.en;
  return (
    <View style={[styles.frame, {backgroundColor: isDark ? '#0A2733' : '#F0F8F2'}]} accessibilityLabel={selected.label}>
      <Text style={[styles.coin, { color: isDark ? '#7EE6A0' : '#087A4A' }]} accessibilityLabel="LUKAS coin">◉</Text>
      <Text style={[styles.label, {color: isDark ? '#7EE6A0' : '#087A4A'}]}>{selected.label}</Text>
      <Text style={[styles.detail, {color: isDark ? '#BED2C6' : '#425D4D'}]}>{selected.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', aspectRatio: 16 / 9, borderRadius: 20, justifyContent: 'center', overflow: 'hidden', padding: 18, width: '100%' },
  coin: { fontSize: 92, fontWeight: '900', lineHeight: 112, marginBottom: 6, textAlign: 'center', width: 112 },
  label: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  detail: { fontSize: 14, marginTop: 8, textAlign: 'center' },
});
