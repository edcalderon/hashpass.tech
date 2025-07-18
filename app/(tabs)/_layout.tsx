import React from 'react';
import { Tabs } from "expo-router";
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { themeShadows, themeSpacing } from '../../lib/theme';
import { useTranslation } from '../../i18n/i18n';

export default function Layout() {
  const { colors } = useTheme();
  const { t } = useTranslation('tabs');

  return (
    <Tabs
      screenOptions={() => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text.primary,
        tabBarStyle: {
          backgroundColor: colors.background.default,
          borderTopWidth: 0,
          height: 60,
          paddingBottom: 0,
          ...themeShadows.small,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontFamily: 'system-ui',
          marginBottom: themeSpacing.xs,
        },
        tabBarItemStyle: {
          paddingVertical: themeSpacing.xs,
        },
        tabBarIconStyle: {
          marginBottom: -themeSpacing.xs,
        },
      })}
    >
      <Tabs.Screen
        name="explore"
        options={{
          title: t("explore"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: t("wallet"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("profile"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

