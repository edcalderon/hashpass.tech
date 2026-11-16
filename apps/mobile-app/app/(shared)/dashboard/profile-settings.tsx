import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { SettingsShortcut } from '../../../types/profile-settings.types';
import ProfileScreen from './profile';
import SettingsScreen from './settings';

export default function ProfileSettingsScreen() {
  const { shortcut: routeShortcut } = useLocalSearchParams<{ shortcut?: string }>();
  const router = useRouter();
  const requestedShortcut = routeShortcut === 'authenticator' || routeShortcut === 'delete-account' || routeShortcut === 'about'
    ? routeShortcut
    : undefined;
  const [showSettings, setShowSettings] = useState(Boolean(requestedShortcut));
  const [initialSettingsShortcut, setInitialSettingsShortcut] = useState<SettingsShortcut | undefined>(requestedShortcut);
  const [handledRouteShortcut, setHandledRouteShortcut] = useState<SettingsShortcut>();

  React.useEffect(() => {
    if (!requestedShortcut) {
      if (handledRouteShortcut) setHandledRouteShortcut(undefined);
      return;
    }
    if (handledRouteShortcut === requestedShortcut) return;
    setHandledRouteShortcut(requestedShortcut);
    setInitialSettingsShortcut(requestedShortcut);
    setShowSettings(true);
  }, [requestedShortcut, handledRouteShortcut]);

  const openSettings = (shortcut?: SettingsShortcut) => {
    setInitialSettingsShortcut(shortcut);
    setShowSettings(true);
  };

  const closeSettings = () => {
    setInitialSettingsShortcut(undefined);
    setShowSettings(false);
    if (requestedShortcut) router.setParams({ shortcut: undefined } as any);
  };

  return (
    <View style={styles.container}>
      {showSettings
        ? <SettingsScreen embedded onBack={closeSettings} initialSettingsShortcut={initialSettingsShortcut} />
        : <ProfileScreen embedded onOpenSettings={openSettings} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
