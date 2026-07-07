import React, { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '../lib/vector-icons';

interface ExternalStatusPreviewProps {
  url: string;
}

export default function ExternalStatusPreview({ url }: ExternalStatusPreviewProps) {
  const { useTheme } = require('../hooks/useTheme') as typeof import('../hooks/useTheme');
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [expanded, setExpanded] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const openExternalPage = () => {
    Linking.openURL(url).catch((error) => {
      console.warn('Failed to open external status page:', error);
    });
  };

  const togglePreview = () => {
    const next = !expanded;
    setExpanded(next);
    setIsLoading(next);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>External Monitor</Text>
          <Text style={styles.subtitle}>
            Expand the live preview below, or open the full tracker in a browser to inspect the whole system status.
          </Text>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={togglePreview}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
          >
            <MaterialIcons
              name={expanded ? 'expand-less' : 'expand-more'}
              size={18}
              color={colors.primary}
            />
            <Text style={styles.actionButtonText}>{expanded ? 'Hide preview' : 'Show preview'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.openButton]}
            onPress={openExternalPage}
            activeOpacity={0.8}
            accessibilityRole="link"
          >
            <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
            <Text style={styles.actionButtonText}>Open full page</Text>
          </TouchableOpacity>
        </View>
      </View>

      {expanded ? (
        <View style={styles.frame}>
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Loading live status page...</Text>
            </View>
          )}
          <iframe
            title="HASHPASS external status page"
            src={url}
            loading="eager"
            sandbox="allow-scripts allow-forms allow-popups"
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoading(false)}
            style={{
              border: 0,
              display: 'block',
              width: '100%',
              height: '100%',
              background: colors.background.default,
            }}
          />
        </View>
      ) : (
        <View style={styles.collapsedBody}>
          <Text style={styles.bodyText}>
            Preview the external status tracker without leaving this page.
          </Text>
          <Text style={styles.noteText}>
            If the preview is blocked by your browser, use the full page link instead.
          </Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Public URL</Text>
        <TouchableOpacity
          style={styles.footerLink}
          onPress={openExternalPage}
          activeOpacity={0.8}
          accessibilityRole="link"
        >
          <Text style={styles.footerLinkText}>hashpass.status.cig.technology</Text>
          <MaterialIcons name="open-in-new" size={14} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      gap: 14,
    },
    header: {
      gap: 12,
    },
    headerText: {
      gap: 4,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.text.secondary,
    },
    headerActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.background.default,
    },
    openButton: {
      borderColor: colors.divider,
    },
    actionButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    frame: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.background.default,
      minHeight: 420,
      height: 420,
    },
    loadingOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      zIndex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      backgroundColor: colors.background.default,
    },
    loadingText: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    collapsedBody: {
      gap: 8,
      paddingVertical: 4,
    },
    bodyText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.text.primary,
    },
    noteText: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.text.secondary,
    },
    footer: {
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      gap: 8,
    },
    footerLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    footerLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
    },
    footerLinkText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
      textDecorationLine: 'underline',
    },
  });
