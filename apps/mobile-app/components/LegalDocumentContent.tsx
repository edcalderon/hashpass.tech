import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { uiPalette } from '@hashpass/ui/tokens';
import { useTheme } from '../hooks/useTheme';
import {
  LegalDocumentBlock,
  LegalDocumentType,
  useCanonicalLegalDocument,
} from '../lib/legal-documents';

interface LegalDocumentContentProps {
  type: LegalDocumentType;
  active?: boolean;
}

function blockKey(block: LegalDocumentBlock, index: number): string {
  if (block.type === 'list') return `list-${index}-${block.items[0] ?? ''}`;
  return `${block.type}-${index}-${block.text.slice(0, 24)}`;
}

export default function LegalDocumentContent({
  type,
  active = true,
}: LegalDocumentContentProps) {
  const { isDark } = useTheme();
  const document = useCanonicalLegalDocument(type, active);
  const styles = getStyles(isDark);

  return (
    <>
      {document.blocks.map((block, index) => {
        const key = blockKey(block, index);

        if (block.type === 'heading') {
          return (
            <Text key={key} style={styles.sectionTitle} selectable>
              {block.text}
            </Text>
          );
        }

        if (block.type === 'list') {
          return (
            <View key={key} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={`${itemIndex}-${item.slice(0, 24)}`} style={styles.listRow}>
                  <Text style={styles.bullet} selectable>•</Text>
                  <Text style={styles.sectionText} selectable>{item}</Text>
                </View>
              ))}
            </View>
          );
        }

        return (
          <Text
            key={key}
            style={block.type === 'quote' ? styles.quote : styles.sectionText}
            selectable
          >
            {block.text}
          </Text>
        );
      })}

      <TouchableOpacity
        accessibilityRole="link"
        onPress={() => Linking.openURL(document.sourceUrl)}
        style={styles.sourceLink}
      >
        <Text style={styles.sourceLinkText} selectable={false}>
          View the canonical document
        </Text>
      </TouchableOpacity>
    </>
  );
}

const getStyles = (isDark: boolean) => {
  const palette = uiPalette(isDark);
  return StyleSheet.create({
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: palette.text,
      marginTop: 24,
      marginBottom: 12,
    },
    sectionText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 22,
      color: palette.text,
      marginBottom: 16,
    },
    quote: {
      fontSize: 14,
      lineHeight: 22,
      color: palette.text,
      backgroundColor: palette.surface,
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
      padding: 16,
      marginBottom: 16,
    },
    list: {
      marginBottom: 8,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    bullet: {
      fontSize: 14,
      lineHeight: 22,
      color: palette.accent,
    },
    sourceLink: {
      alignSelf: 'flex-start',
      paddingVertical: 12,
      marginTop: 8,
      marginBottom: 24,
    },
    sourceLinkText: {
      fontSize: 14,
      fontWeight: '600',
      color: palette.accent,
    },
  });
};
