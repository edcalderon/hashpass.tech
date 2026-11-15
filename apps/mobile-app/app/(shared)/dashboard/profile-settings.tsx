import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import ProfileScreen from './profile';
import SettingsScreen from './settings';

export default function ProfileSettingsScreen() {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <View style={styles.container}>
      {showSettings
        ? <SettingsScreen embedded onBack={() => setShowSettings(false)} />
        : <ProfileScreen embedded onOpenSettings={() => setShowSettings(true)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
