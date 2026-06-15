import React from 'react';
import { Redirect } from 'expo-router';

export default function BSL2025HomeScreen() {
  // Redirect to explore dashboard
  return <Redirect href="/(shared)/dashboard/explore" />;
}
