import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';

export default function HashPointsView() {
  const { colors } = useTheme();
  const { t } = useTranslation('wallet');
  return <View style={{ padding: 24, gap: 8, borderRadius: 20, borderWidth: 1, borderColor: colors.divider }}>
    <Text style={{ color: colors.text.primary, fontSize: 18, fontWeight: '700' }}>{t('overview.pointsTitle', 'Hash Points')}</Text>
    <Text style={{ color: colors.text.secondary, lineHeight: 22 }}>{t('overview.pointsUnavailable', 'Points balances and exchanges are not available yet.')}</Text>
  </View>;
}
