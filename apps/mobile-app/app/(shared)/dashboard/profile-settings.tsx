import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedTabs } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import { t } from '@lingui/macro';
import { useTheme } from '../../../hooks/useTheme';
import { useDashboardPageLayout } from '../../../hooks/useDashboardPageLayout';
import type { ProfileSettingsSection } from '../../../types/profile-settings.types';
import ProfileScreen from './profile';
import SettingsScreen from './settings';

export default function ProfileSettingsScreen() {
  const [section, setSection] = useState<ProfileSettingsSection>('profile');
  const { isDark, colors } = useTheme();
  const { topInset } = useDashboardPageLayout();
  const mode = isDark ? 'dark' : 'light';
  const tabs = [
    { id: 'profile' as const, label: t({ id: 'nav.profile', message: 'Profile' }) },
    { id: 'settings' as const, label: t({ id: 'nav.settings', message: 'Settings' }) },
  ];

  return (
    <View style={styles.container}>
      <View style={[styles.tabs, { paddingTop: topInset }]}>
        <SegmentedTabs
          mode={mode}
          fullWidth
          accessibilityLabel={t({ id: 'nav.profileSettingsTabs', message: 'Profile and settings sections' })}
          tabs={tabs}
          value={section}
          onChange={(value) => setSection(value as ProfileSettingsSection)}
          accentColor={colors.primary}
          surfaceColor={colors.background.paper}
        />
      </View>
      <View style={styles.pages}>
        <View
          style={[styles.page, section !== 'profile' && styles.hidden]}
          pointerEvents={section === 'profile' ? 'auto' : 'none'}
          accessibilityElementsHidden={section !== 'profile'}
          importantForAccessibility={section === 'profile' ? 'auto' : 'no-hide-descendants'}
        >
          <ProfileScreen embedded />
        </View>
        <View
          style={[styles.page, section !== 'settings' && styles.hidden]}
          pointerEvents={section === 'settings' ? 'auto' : 'none'}
          accessibilityElementsHidden={section !== 'settings'}
          importantForAccessibility={section === 'settings' ? 'auto' : 'no-hide-descendants'}
        >
          <SettingsScreen embedded onBack={() => setSection('profile')} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabs: {
    width: '100%',
    maxWidth: 1040,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingBottom: uiTokens.space.md,
  },
  pages: { flex: 1 },
  page: { flex: 1 },
  hidden: { display: 'none' },
});
