import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';

/** Legacy/shared links retain their card while entering the unified security gate. */
export default function ContactsRoute() {
  const params = useLocalSearchParams();
  const { user, isLoading } = useAuth();
  if (isLoading) return <ActivityIndicator />;
  if (!user) {
    const card = typeof params.card === 'string' ? params.card : undefined;
    return <Redirect href={{ pathname: '/(shared)/auth', params: {
      returnTo: `/contacts${card ? `?card=${encodeURIComponent(card)}` : ''}`,
    } }} />;
  }
  return <Redirect href={{ pathname: '/(shared)/dashboard/wallet', params: { ...params, section: 'contacts' } }} />;
}
