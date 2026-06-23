import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
// @ts-ignore — Expo SDK 53 type definitions lag behind; named export works at runtime
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

const DISMISSED_KEY = 'soft_update_dismissed_version';

type Props = {
  latestVersion: string;
  storeUrl: string | null;
  storeWebUrl: string | null;
};

export default function SoftUpdateBanner({ latestVersion, storeUrl, storeWebUrl }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const slideAnim = React.useRef(new Animated.Value(120)).current;

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((dismissed) => {
      if (dismissed !== latestVersion) {
        setVisible(true);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 60,
          friction: 10,
        }).start();
      }
    });
  }, [latestVersion]);

  const dismiss = async () => {
    Animated.timing(slideAnim, {
      toValue: 120,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
    await AsyncStorage.setItem(DISMISSED_KEY, latestVersion);
  };

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
    dismiss();
  };

  if (!visible) return null;

  const bannerBg = isDark ? '#1C1C3A' : '#EEF2FF';
  const borderColor = isDark ? '#3730A3' : '#6366F1';

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bannerBg, borderLeftColor: borderColor, bottom: insets.bottom + 12 },
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <MaterialIcons name="update" size={22} color={colors.primary} style={styles.icon} />
      <View style={styles.textArea}>
        <Text style={[styles.title, { color: colors.text.primary }]}>Update Available</Text>
        <Text style={[styles.body, { color: colors.text.secondary }]}>
          Version {latestVersion} is ready to install.
        </Text>
      </View>
      <TouchableOpacity onPress={openStore} style={[styles.updateBtn, { backgroundColor: colors.primary }]}>
        <Text style={styles.updateBtnText}>Update</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={dismiss} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <MaterialIcons name="close" size={18} color={colors.text.secondary} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingHorizontal: 16,
    borderLeftWidth: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  icon: {
    marginRight: 10,
    flexShrink: 0,
  },
  textArea: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 1,
  },
  body: {
    fontSize: 12,
    lineHeight: 16,
  },
  updateBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginRight: 8,
    flexShrink: 0,
  },
  updateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  closeBtn: {
    flexShrink: 0,
    padding: 2,
  },
});
