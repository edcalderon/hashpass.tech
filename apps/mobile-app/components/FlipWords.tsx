import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Text, StyleSheet, TextStyle } from "react-native";

const FlipWords = ({
  words,
  duration = 3000,
  className,
  textStyle,
}: {
  words: string[];
  duration?: number;
  className?: string;
  textStyle?: TextStyle;
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
    <Animated.View style={[styles.container, { opacity, transform: [{ translateY }] }]}>
      <Text style={[styles.text, textStyle]}>{currentWord}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  text: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
    textAlign: 'center',
  },
});

export default FlipWords;
