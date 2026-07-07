import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Animated,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';

const DISMISSED_KEY = 'soft_update_dismissed_version';

type Props = {
  latestVersion: string;
  storeUrl: string | null;
  storeWebUrl: string | null;
};

export default function SoftUpdateBanner({ latestVersion, storeUrl, storeWebUrl }: Props) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY).then((dismissed) => {
      if (dismissed !== latestVersion) {
        setVisible(true);
        Animated.parallel([
          Animated.spring(slideAnim, {
            toValue: 0,
            useNativeDriver: true,
            tension: 65,
            friction: 11,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 220,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });
  }, [latestVersion, slideAnim, opacityAnim]);

  const dismiss = async () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 100,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
    await AsyncStorage.setItem(DISMISSED_KEY, latestVersion);
  };

  const openStore = async () => {
    if (storeUrl) {
      const canOpen = await Linking.canOpenURL(storeUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(storeUrl).catch(() => null);
        dismiss();
        return;
      }
    }
    if (storeWebUrl) {
      await Linking.openURL(storeWebUrl).catch(() => null);
    }
    dismiss();
  };

  if (!visible) return null;

  const bg = isDark ? 'rgba(18, 18, 30, 0.97)' : 'rgba(255, 255, 255, 0.97)';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const labelCol = isDark ? '#e4e4f0' : '#111';
  const subCol = isDark ? '#9898b0' : '#6b7280';

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { bottom: insets.bottom + 16 },
        { transform: [{ translateY: slideAnim }], opacity: opacityAnim },
      ]}
      pointerEvents="box-none"
    >
      <View style={[styles.pill, { backgroundColor: bg, borderColor: borderCol }]}>
        {/* icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="arrow-down-circle" size={20} color="#6366f1" />
        </View>

        {/* text */}
        <View style={styles.textWrap}>
          <Text style={[styles.label, { color: labelCol }]} numberOfLines={1}>
            v{latestVersion} available
          </Text>
          <Text style={[styles.sub, { color: subCol }]} numberOfLines={1}>
            Update on Play Store
          </Text>
        </View>

        {/* update button */}
        <TouchableOpacity
          onPress={openStore}
          activeOpacity={0.78}
          style={styles.updateBtn}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={styles.updateBtnText}>Update</Text>
        </TouchableOpacity>

        {/* divider */}
        <View style={[styles.divider, { backgroundColor: borderCol }]} />

        {/* dismiss */}
        <TouchableOpacity
          onPress={dismiss}
          activeOpacity={0.7}
          style={styles.closeBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={16} color={subCol} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  iconWrap: {
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 11,
    marginTop: 1,
  },
  updateBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexShrink: 0,
  },
  updateBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  divider: {
    width: 1,
    height: 20,
    flexShrink: 0,
  },
  closeBtn: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
  },
});
