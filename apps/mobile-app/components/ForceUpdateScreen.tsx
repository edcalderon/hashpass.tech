import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

type Props = {
  minimumVersion: string;
  storeUrl: string | null;
  storeWebUrl: string | null;
};

export default function ForceUpdateScreen({ minimumVersion, storeUrl, storeWebUrl }: Props) {
  const { colors, isDark } = useTheme();

  const openStore = async () => {
    const primary = storeUrl;
    const fallback = storeWebUrl;

    if (primary) {
      const canOpen = await Linking.canOpenURL(primary).catch(() => false);
      if (canOpen) {
        await Linking.openURL(primary).catch(() => null);
        return;
      }
    }
    if (fallback) {
      await Linking.openURL(fallback).catch(() => null);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.default }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: isDark ? '#1a1a2e' : '#EEF2FF' }]}>
          <MaterialIcons name="system-update" size={56} color={colors.primary} />
        </View>

        <Text style={[styles.title, { color: colors.text.primary }]}>
          Update Required
        </Text>

        <Text style={[styles.body, { color: colors.text.secondary }]}>
          This version of HASHPASS is no longer supported. Please update to continue.
        </Text>

        <Text style={[styles.versionHint, { color: colors.text.secondary }]}>
          Minimum required version: {minimumVersion}
        </Text>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={openStore}
          activeOpacity={0.85}
        >
          <MaterialIcons name="download" size={20} color="#FFFFFF" style={styles.buttonIcon} />
          <Text style={styles.buttonText}>Update Now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  content: {
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  versionHint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 40,
    opacity: 0.7,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
  },
  buttonIcon: {
    marginRight: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
});
