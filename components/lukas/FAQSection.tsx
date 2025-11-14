import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

interface FAQItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
  isDark: boolean;
  isMobile: boolean;
}

function FAQItem({ question, answer, isOpen, onToggle, isDark, isMobile }: FAQItemProps) {
  const height = useSharedValue(isOpen ? 1 : 0);
  const rotation = useSharedValue(isOpen ? 180 : 0);

  useEffect(() => {
    if (isOpen) {
      height.value = withTiming(1, { duration: 300 });
      rotation.value = withTiming(180, { duration: 300 });
    } else {
      height.value = withTiming(0, { duration: 300 });
      rotation.value = withTiming(0, { duration: 300 });
    }
  }, [isOpen]);

  const animatedHeight = useAnimatedStyle(() => ({
    maxHeight: height.value === 1 ? 500 : 0,
    opacity: height.value,
  }));

  const animatedArrow = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const styles = getStyles(isDark, {} as any, isMobile);

  return (
    <View style={styles.faqItem}>
      <TouchableOpacity
        onPress={onToggle}
        style={styles.faqQuestion}
        activeOpacity={0.7}
      >
        <Text style={styles.faqQuestionText}>{question}</Text>
        <Animated.View style={animatedArrow}>
          <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <Path
              d="M6 9l6 6 6-6"
              stroke={isDark ? '#9CA3AF' : '#6B7280'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      </TouchableOpacity>

      <Animated.View style={[styles.faqAnswer, animatedHeight]}>
        <Text style={styles.faqAnswerText}>{answer}</Text>
      </Animated.View>
    </View>
  );
}

export function FAQSection() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const styles = getStyles(isDark, colors, isMobile);

  const faqs = [
    {
      question: t('faq.q1.question'),
      answer: t('faq.q1.answer'),
    },
    {
      question: t('faq.q2.question'),
      answer: t('faq.q2.answer'),
    },
    {
      question: t('faq.q3.question'),
      answer: t('faq.q3.answer'),
    },
    {
      question: t('faq.q4.question'),
      answer: t('faq.q4.answer'),
    },
    {
      question: t('faq.q5.question'),
      answer: t('faq.q5.answer'),
    },
  ];

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('faq.title')}</Text>
      <Text style={styles.subtitle}>
        {t('faq.subtitle')}
      </Text>

      <View style={styles.faqsContainer}>
        {faqs.map((faq, index) => (
          <FAQItem
            key={index}
            question={faq.question}
            answer={faq.answer}
            isOpen={openIndex === index}
            onToggle={() => toggleFAQ(index)}
            isDark={isDark}
            isMobile={isMobile}
          />
        ))}
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean) => StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  title: {
    fontSize: isMobile ? 32 : 48,
    fontWeight: '800',
    color: isDark ? '#F9FAFB' : '#111827',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: isMobile ? 16 : 18,
    color: isDark ? '#9CA3AF' : '#6B7280',
    textAlign: 'center',
    marginBottom: isMobile ? 40 : 60,
  },
  faqsContainer: {
    gap: 16,
  },
  faqItem: {
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(249, 250, 251, 0.8)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    overflow: 'hidden',
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    gap: 16,
  },
  faqQuestionText: {
    flex: 1,
    fontSize: isMobile ? 16 : 18,
    fontWeight: '700',
    color: isDark ? '#F9FAFB' : '#111827',
    lineHeight: isMobile ? 24 : 28,
  },
  faqAnswer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  faqAnswerText: {
    fontSize: isMobile ? 14 : 16,
    color: isDark ? '#9CA3AF' : '#6B7280',
    lineHeight: isMobile ? 22 : 26,
  },
});

