import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Text, StyleSheet } from "react-native";

const FlipWords = ({
  words,
  duration = 3000,
  className,
}: {
  words: string[];
  duration?: number;
  className?: string;
}) => {
  const [currentWord, setCurrentWord] = useState(words[0]);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const animateToNext = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -10, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setCurrentWord((w) => {
        const idx = words.indexOf(w);
        return words[(idx + 1) % words.length];
      });
      translateY.setValue(10);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  }, [words, opacity, translateY]);

  useEffect(() => {
    const timer = setTimeout(animateToNext, duration);
    return () => clearTimeout(timer);
  }, [currentWord, duration, animateToNext]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <Text style={styles.text}>{currentWord}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  text: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
});

export default FlipWords;
