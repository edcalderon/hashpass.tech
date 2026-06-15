import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { passSystemService, PassInfo } from '../../../lib/pass-system';
import DynamicQRDisplay from '../../../components/DynamicQRDisplay';

export default function QRViewScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [passInfo, setPassInfo] = useState<PassInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const styles = getStyles(isDark, colors);
  const passId = params.passId as string;

  useEffect(() => {
    if (!user) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    loadPassInfo();
  }, [user, passId]);

  const loadPassInfo = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const pass = await passSystemService.getUserPassInfo(user.id);
      
      if (!pass) {
        setError('No pass found');
        return;
      }

      // If passId is provided, verify it matches
      if (passId && pass.pass_id !== passId) {
        setError('Pass not found');
        return;
      }

      setPassInfo(pass);
    } catch (err: any) {
      setError(err.message || 'Error loading pass information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading pass information...</Text>
        </View>
      </View>
    );
  }

  if (error || !passInfo) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={64} color={colors.error} />
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{error || 'Pass not found'}</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.back()}>
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pass QR Code</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Pass Info Card */}
      <View style={styles.passCard}>
        <View style={styles.passHeader}>
          <View>
            <Text style={styles.passType}>
              {passSystemService.getPassTypeDisplayName(passInfo.pass_type)}
            </Text>
            <Text style={styles.passNumber}>{passInfo.pass_number}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(passInfo.status) }]}>
            <Text style={styles.statusText}>{passInfo.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.passDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={20} color={colors.text.secondary} />
            <Text style={styles.detailText}>Nov 12-14, 2025</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="ticket-outline" size={20} color={colors.text.secondary} />
            <Text style={styles.detailText}>
              {passInfo.remaining_requests} meeting requests remaining
            </Text>
          </View>
        </View>
      </View>

      {/* QR Code Display */}
      <View style={styles.qrSection}>
        <Text style={styles.sectionTitle}>Your Dynamic QR Code</Text>
        <Text style={styles.sectionDescription}>
          Present this QR code at the event entrance. It updates automatically for security.
        </Text>
        
        <View style={styles.qrContainer}>
          <DynamicQRDisplay
            passId={passInfo.pass_id}
            passNumber={passInfo.pass_number}
            passType={passInfo.pass_type}
            size={280}
            showRefreshButton={true}
            autoRefresh={true}
            refreshInterval={30}
          />
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsCard}>
        <MaterialIcons name="info-outline" size={24} color={colors.primary} />
        <View style={styles.instructionsContent}>
          <Text style={styles.instructionsTitle}>How to Use</Text>
          <Text style={styles.instructionsText}>
            • Keep this QR code visible when entering the event{'\n'}
            • The QR code refreshes every 30 seconds for security{'\n'}
            • Make sure your device has internet connection{'\n'}
            • If the QR code expires, tap &quot;Refresh QR&quot; to generate a new one
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'active': return '#34A853';
    case 'used': return '#8E8E93';
    case 'expired': return '#FF9500';
    case 'cancelled': return '#FF3B30';
    case 'suspended': return '#FF9500';
    default: return '#8E8E93';
  }
};

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.default,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.text.secondary,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32,
    },
    errorTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginTop: 16,
      marginBottom: 8,
    },
    errorText: {
      fontSize: 16,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    backButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: colors.background.secondary,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text.primary,
    },
    passCard: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 20,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    passHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    passType: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginBottom: 4,
    },
    passNumber: {
      fontSize: 14,
      color: colors.text.secondary,
      fontFamily: 'monospace',
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    passDetails: {
      gap: 12,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    detailText: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    qrSection: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 24,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.divider,
      alignItems: 'center',
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginBottom: 8,
      textAlign: 'center',
    },
    sectionDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    qrContainer: {
      width: '100%',
      alignItems: 'center',
    },
    instructionsCard: {
      flexDirection: 'row',
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.divider,
      gap: 16,
    },
    instructionsContent: {
      flex: 1,
    },
    instructionsTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 8,
    },
    instructionsText: {
      fontSize: 14,
      color: colors.text.secondary,
      lineHeight: 20,
    },
    button: {
      backgroundColor: colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
  });

