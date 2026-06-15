import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Share, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../../hooks/useTheme';
import { useAuth } from '../../../hooks/useAuth';
import { passSystemService, PassInfo } from '../../../lib/pass-system';
import DynamicQRDisplay from '../../../components/DynamicQRDisplay';
import * as Clipboard from 'expo-clipboard';

export default function PassDetailsScreen() {
  const { colors, isDark } = useTheme();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [passInfo, setPassInfo] = useState<PassInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const styles = getStyles(isDark, colors);
  const passId = params.passId as string;

  useEffect(() => {
    // Wait for auth to finish loading before checking
    if (authLoading) {
      return;
    }

    if (!user) {
      setError('User not authenticated');
      setLoading(false);
      return;
    }

    loadPassInfo();
  }, [user, passId, authLoading]);

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


  const handleShare = async () => {
    if (!passInfo) return;

    try {
      const passTypeDisplay = passSystemService.getPassTypeDisplayName(passInfo.pass_type);
      let shareMessage = `Check out my ${passTypeDisplay} pass for BSL 2025!\n\nPass Number: ${passInfo.pass_number}\nPass Type: ${passTypeDisplay}\n\nPresent this QR code at the event entrance.`;


      // Check if Share API is available (works on mobile and some browsers)
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        // Use Web Share API if available
        await navigator.share({
          title: `BSL 2025 ${passTypeDisplay} Pass`,
          text: shareMessage,
        });
      } else if (Platform.OS !== 'web' && Share.share) {
        // Use React Native Share on mobile
        const result = await Share.share({
          message: shareMessage,
          title: `BSL 2025 ${passTypeDisplay} Pass`,
        });

        if (result.action === Share.sharedAction) {
          console.log('Pass shared successfully');
        }
      } else {
        // Fallback: Copy to clipboard for browsers without Share API
        await Clipboard.setStringAsync(shareMessage);
        Alert.alert(
          'Pass Information Copied',
          'Pass information has been copied to your clipboard. You can paste it anywhere to share.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      // If share was cancelled, don't show error
      if (error?.message?.includes('cancel') || error?.message?.includes('AbortError')) {
        return;
      }
      
      // For other errors, fallback to clipboard
      try {
        const passTypeDisplay = passSystemService.getPassTypeDisplayName(passInfo.pass_type);
        let shareMessage = `Check out my ${passTypeDisplay} pass for BSL 2025!\n\nPass Number: ${passInfo.pass_number}\nPass Type: ${passTypeDisplay}\n\nPresent this QR code at the event entrance.`;
        
        
        await Clipboard.setStringAsync(shareMessage);
        Alert.alert(
          'Pass Information Copied',
          'Pass information has been copied to your clipboard. You can paste it anywhere to share.',
          [{ text: 'OK' }]
        );
      } catch (clipboardError) {
        console.error('Error copying to clipboard:', clipboardError);
        Alert.alert('Error', 'Unable to share pass. Please try again.');
      }
    }
  };


  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading pass details...</Text>
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
        <TouchableOpacity 
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(shared)/dashboard/explore');
            }
          }} 
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pass Details</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Pass Info Card */}
      <View style={styles.passCard}>
        <View style={styles.passHeader}>
          <View style={styles.passHeaderLeft}>
            <Text style={styles.passType}>
              {passSystemService.getPassTypeDisplayName(passInfo.pass_type)}
            </Text>
            <Text style={styles.passNumber}>{passInfo.pass_number}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(passInfo.status) }]}>
            <Text style={styles.statusText}>{passInfo.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Pass Details */}
        <View style={styles.detailsSection}>
          <DetailRow
            icon="calendar-outline"
            label="Event"
            value="BSL 2025"
            colors={colors}
            styles={styles}
            isDark={isDark}
          />
          <DetailRow
            icon="calendar-outline"
            label="Date"
            value="November 12-14, 2025"
            colors={colors}
            styles={styles}
            isDark={isDark}
          />
          <DetailRow
            icon="ticket-outline"
            label="Meeting Requests"
            value={`${passInfo.used_requests} / ${passInfo.max_requests} used`}
            colors={colors}
            styles={styles}
            isDark={isDark}
          />
          <DetailRow
            icon="flash-outline"
            label="Boost Available"
            value={`${passInfo.remaining_boost} / ${passInfo.max_boost}`}
            colors={colors}
            styles={styles}
            isDark={isDark}
          />
        </View>
      </View>

      {/* Access Features */}
      {passInfo.access_features && passInfo.access_features.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Access Features</Text>
          <View style={styles.featuresList}>
            {passInfo.access_features.map((feature, index) => (
              <View key={index} style={styles.featureItem}>
                <Ionicons 
                  name="checkmark-circle" 
                  size={20} 
                  color={isDark ? '#4ADE80' : (colors.success || '#34A853')} 
                />
                <Text style={styles.featureText}>{feature}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Special Perks */}
      {passInfo.special_perks && passInfo.special_perks.length > 0 && (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Special Perks</Text>
          <View style={styles.featuresList}>
            {passInfo.special_perks.map((perk, index) => (
              <View key={index} style={styles.featureItem}>
                <Ionicons 
                  name="star" 
                  size={20} 
                  color={isDark ? '#FFB84D' : (colors.warning || '#FF9500')} 
                />
                <Text style={styles.featureText}>{perk}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* QR Code Section */}
      <View style={styles.qrSection}>
        <Text style={styles.sectionTitle}>QR Code</Text>
        <Text style={styles.sectionDescription}>
          Present this QR code at the event entrance. It updates automatically for security.
        </Text>
        
        <View style={styles.qrContainer}>
          <DynamicQRDisplay
            passId={passInfo.pass_id}
            passNumber={passInfo.pass_number}
            passType={passInfo.pass_type}
            size={250}
            showRefreshButton={true}
            autoRefresh={true}
            refreshInterval={30}
          />
        </View>
      </View>

    </ScrollView>
  );
}

const DetailRow = ({ icon, label, value, colors, styles, isDark }: { icon: string; label: string; value: string; colors: any; styles: any; isDark?: boolean }) => (
  <View style={styles.detailRow}>
    <Ionicons 
      name={icon as any} 
      size={20} 
      color={isDark ? colors.text.primary : colors.text.secondary} 
    />
    <View style={styles.detailContent}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  </View>
);

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
      flex: 1,
      textAlign: 'center',
    },
    shareButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: colors.background.secondary,
    },
    passCard: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    passHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    passHeaderLeft: {
      flex: 1,
    },
    passType: {
      fontSize: 24,
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
    divider: {
      height: 1,
      backgroundColor: colors.divider,
      marginVertical: 16,
    },
    detailsSection: {
      gap: 16,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    detailContent: {
      flex: 1,
    },
    detailLabel: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 2,
    },
    detailValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    sectionCard: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginBottom: 16,
    },
    sectionDescription: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 20,
    },
    featuresList: {
      gap: 12,
    },
    featureItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    featureText: {
      fontSize: 14,
      color: colors.text.primary,
      flex: 1,
    },
    qrSection: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 24,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.divider,
      alignItems: 'center',
    },
    qrContainer: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 20,
    },
    actionsSection: {
      gap: 12,
      marginTop: 8,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 12,
    },
    primaryButton: {
      backgroundColor: colors.primary,
    },
    secondaryButton: {
      backgroundColor: colors.background.secondary,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    actionButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
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

