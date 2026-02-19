import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface SpeakerQuickScrollProps {
  groupedSpeakers: { [key: string]: any[] };
  onLetterPress: (letter: string) => void;
  sortBy: string;
}

export default function SpeakerQuickScroll({ 
  groupedSpeakers, 
  onLetterPress,
  sortBy 
}: SpeakerQuickScrollProps) {
  const { isDark, colors } = useTheme();
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const styles = getStyles(isDark, colors);

  // Get all available letters
  const availableLetters = Object.keys(groupedSpeakers).sort((a, b) => {
    if (a === '#') return 1; // Put # at the end
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  const handleLetterPress = (letter: string) => {
    setSelectedLetter(letter);
    setShowTooltip(true);
    onLetterPress(letter);
    
    // Hide tooltip after a short delay
    setTimeout(() => {
      setShowTooltip(false);
      setSelectedLetter(null);
    }, 1000);
  };

  const getLetterLabel = (letter: string): string => {
    if (letter === '#') return 'Others';
    return letter;
  };

  const getLetterCount = (letter: string): number => {
    return groupedSpeakers[letter]?.length || 0;
  };

  return (
    <View style={styles.container}>
      {/* Tooltip */}
      {showTooltip && selectedLetter && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>
            {getLetterLabel(selectedLetter)} ({getLetterCount(selectedLetter)})
          </Text>
        </View>
      )}

      {/* Quick Scroll Letters */}
      <View style={styles.lettersContainer}>
        {availableLetters.map((letter) => (
          <TouchableOpacity
            key={letter}
            style={[
              styles.letterButton,
              selectedLetter === letter && styles.letterButtonSelected
            ]}
            onPress={() => handleLetterPress(letter)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.letterText,
              selectedLetter === letter && styles.letterTextSelected
            ]}>
              {letter}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: [{ translateY: -100 }],
    zIndex: 1000,
  },
  tooltip: {
    position: 'absolute',
    right: 50,
    top: -20,
    backgroundColor: colors.background.paper,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.2)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  tooltipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  lettersContainer: {
    backgroundColor: colors.background.paper,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  letterButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 1,
  },
  letterButtonSelected: {
    backgroundColor: '#007AFF',
  },
  letterText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  letterTextSelected: {
    color: '#FFFFFF',
  },
});
