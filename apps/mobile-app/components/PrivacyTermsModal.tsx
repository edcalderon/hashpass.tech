import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ModalBackdrop } from '@hashpass/ui/primitives';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import { LegalDocumentType } from '../lib/legal-documents';
import { Ionicons } from '../lib/vector-icons';
import LegalDocumentContent from './LegalDocumentContent';

interface PrivacyTermsModalProps {
  visible: boolean;
  type: LegalDocumentType;
  onClose: () => void;
}

export default function PrivacyTermsModal({
  visible,
  type,
  onClose,
}: PrivacyTermsModalProps) {
  const { colors, isDark } = useTheme();
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  const { t } = useTranslation(type);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });
    return () => subscription?.remove();
  }, []);

  const styles = getStyles(colors, screenWidth);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <ModalBackdrop mode={isDark ? 'dark' : 'light'}>
        <SafeAreaView style={styles.modalContainer}>
          <View accessibilityViewIsModal style={styles.modalContent}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.headerTitle} selectable={false}>
                {t('title', type === 'privacy' ? 'Privacy Policy' : 'Terms of Service')}
              </Text>
              <TouchableOpacity
                accessibilityLabel="Close"
                accessibilityRole="button"
                onPress={onClose}
                style={styles.closeButton}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={28} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.contentContainer}
            >
              <LegalDocumentContent type={type} active={visible} />
            </ScrollView>
          </View>
        </SafeAreaView>
      </ModalBackdrop>
    </Modal>
  );
}

const getStyles = (colors: any, screenWidth: number) => StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    backgroundColor: colors.background.default,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        width: '100%',
        marginTop: 40,
        ...(screenWidth >= 768
          ? { maxWidth: '100%' }
          : { maxWidth: 600, alignSelf: 'center' }),
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  contentContainer: {
    paddingTop: 8,
    paddingBottom: 40,
  },
});
